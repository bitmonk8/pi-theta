# Bug 0107 — The bug-0069 constraint-5 lock-step witness is a blacklist of two byte sequences over one function's source text, so it reds on one spelling of the drift and not on the class: `tests/tools-entry-closed-grammar-lockstep.test.ts` group (D1) asserts only that `presentedCallableNames`' body carries no `split(` and no quoted `as`, and two re-tokenisations that reinstate the whole drift — `match(/\S+/g)` plus `includes(" as ")`, and `indexOf(" as ")` plus `search(/\s/)` — pass both cells; group (D2), which the file calls "the derivation both sides must agree on", asks only the resolver, so it passes while the fallback already fails one of the three derivations its own comment says a delegating fallback must reproduce verbatim — `./code-review.theta` presents as `code-review` at the fallback and `code_review` at the resolver and at the parse gate

- **Status:** open. §Fix is constraint-pinned with a recommendation: four
  dispositions are stated and (c) — replacing the two-regex blacklist with a
  whitelist requiring the scanned body to call `parseToolsEntry` — is
  recommended. The choice between (c) and (b) (a behavioural cell over the
  producer drive, measured feasible in §Reproduction), and the disposition of
  the name divergence measured here, are left to the run. No ordering
  dependency: 0069 shipped in 0.62.0 and published the constraint this witness
  discharges.
- **Sev/Diff estimate:** S3/D2 — a shipped gate that cannot red on the defect
  class it guards, plus a reader divergence at HEAD it does not detect; the fix
  is one witness file with no new registered code and no spec edit, over an
  in-run decision on whether the divergence is closed in the same change.
- **Kind:** verification gap, one witness file. The obligation bug 0069 §Fix
  constraint 5 states is behavioural — `presentedCallableNames` "must move in
  lock-step or it will disagree with the resolver about which entries exist"
  (`docs/bugs/0069-tools-entry-residue-silently-dropped.md:438–441`). The
  assertion that discharges it is textual: two `not.toMatch` regexes over the
  function's source slice
  (`tests/tools-entry-closed-grammar-lockstep.test.ts:95`, `:103`). The two
  regexes name spellings of the old implementation, not the property; a body
  that answers "which entries exist" with any other tokeniser satisfies both
  cells while disagreeing with the resolver exactly as the pre-fix body did.
  The second group in the file, (D2), is behavioural but one-sided: it calls
  `resolveCallableSet` and nothing else (`:137–142`, `:149–153`), so it pins
  what the resolver derives and never asks the fallback whether it agrees.
- **Related:**
  - [0069](./0069-tools-entry-residue-silently-dropped.md) — **fixed (0.62.0)**,
    the parent and the filing origin. This is its §Fix *Residuals* item 4
    (`:198–207`), a disposition it pinned rather than closed: "group (D1)
    asserts that `presentedCallableNames`' body carries no `split(` and no
    quoted `as`, because the function is module-private with no cheap
    behavioural observable (its only reach is a full bind-and-execute producer
    drive whose observable is the environment's callable registry, not the name
    list). It reds correctly against the pre-fix body — verified by
    neutralisation — but a novel re-tokenisation (`match(/\S+/g)`,
    `includes(" as ")`) would evade it. Reshape only if a behavioural
    observable appears." This report measures both halves of that sentence: the
    evasion (two spellings, both passing) and the observable (a producer drive
    whose registry membership is readable through the bug-0016 dispatch belt in
    a harness shape the suite already runs).
  - [0106](./0106-tools-entry-grammar-derivations-outside-lockstep.md) —
    **open**, filed in the same wave from 0069 §Fix *Residuals* item 3
    (`:186–197`): three further entry-grammar derivations outside the lock-step
    (`toolsEntrySpec` at `src/extension/production-composition.ts:1583–1586`,
    `toolCallableName`, `piToolCallableName`). Their drift is
    likewise outside what this witness can detect; the two filings together
    describe the whole of the lock-step's coverage. One of the three,
    `toolCallableName` (`src/parser/theta-document.ts:4505–4519`), supplies the
    third answer measured in §Reproduction. Coordination: both fixes may edit
    `tests/tools-entry-closed-grammar-lockstep.test.ts`; whichever lands second
    rebases on the first.
  - [0048](./0048-double-session-start-live-vacuous-quiesce-witness.md) —
    **open**, the nearest class sibling: a shipped witness whose assertion
    cannot red on the condition it claims to guard, filed against
    `AGENTS.md:111–115` ("A live assertion that cannot red is worthless"). 0048
    is the precedent that this class is tracked as a bug in this repo rather
    than tolerated. The two differ in shape: 0048's assertion is satisfied by
    two states it cannot discriminate; this one discriminates one spelling of
    one state.
- **Affected** (every citation verified at HEAD `99b65438`, 0.62.0):
  - `tests/tools-entry-closed-grammar-lockstep.test.ts` (163 lines) — **the
    witness.**
    - `:51–56` — `PRODUCER_SOURCE`, a `readFileSync` of
      `../src/extension/production-theta-producer.ts`. The gate's only input is
      those bytes.
    - `:64–80` — `topLevelFunctionBody`, the scan. It slices from
      `\nfunction <name>(` to the first `\n}\n` and throws by name when the
      declaration is absent (`:65–71`) or unterminated (`:72–78`), so a rename
      or a move cannot read as a pass (`:46–47` states this).
    - `:86–105` — group (D1), two cells over the slice
      (`:87`): `expect(body, …).not.toMatch(/\bsplit\(/)` (`:89–96`, assertion
      at `:95`) and `expect(body, …).not.toMatch(/["']as["']/)` (`:98–104`,
      assertion at `:103`). Both are absence assertions over source text. No
      third cell constrains what the body does instead.
    - `:144–163` — group (D2). `resolveList` (`:131–142`) calls
      `resolveCallableSet` over `deps` (`:111–129`); the cell asserts
      `registered` and the entry keys `["code_review","read","searcher"]` for
      the items `["read", "./code-review.theta", "grep as searcher"]`
      (`:149–161`). The file imports only from `../src/parser/callable-set`
      (`:4–9`) and never imports the producer module, so no cell calls
      `presentedCallableNames` or compares its output with the resolver's.
      `:146–148` states what the group is for: "The three derivations a
      delegating fallback has to reproduce verbatim: the Pi-tool name
      unchanged, the basename with hyphens mapped to underscores, and the `as`
      target in place of either default." The fallback reproduces the first and
      the third and not the second (measured in §Reproduction).
    - `:28–37` — the TIER paragraph, which records the reasoning: the function
      "is module-private … and its only reach is a full bind-and-execute drive
      through the producer, whose observable is the environment's callable
      registry rather than the name list", and cites
      `tests/di-seam-skeleton.test.ts` as the footing for scanning shipped
      source (`:33–35`).
    - `:11–21` and `:39–44` — the header block, still in its pre-fix tense at
      HEAD. It cites `presentedCallableNames` at
      `src/extension/production-theta-producer.ts:3595` (the declaration is at
      `:3600`), describes ":3600–3607" as "a whitespace split plus the
      `parts[1] === "as"` test" (that range holds the delegating loop), and
      states "WHAT IS RED HERE AND WHY: (D1) the fallback still carries its own
      whitespace-split token grammar". All three cells pass at HEAD (measured).
  - `src/extension/production-theta-producer.ts:3600–3620` —
    **the subject.** `presentedCallableNames`, module-private (no `export`;
    three call sites, `:1212`, `:1493`, `:1739`). `:3601–3604` is the snapshot
    arm; `:3605–3619` the snapshot-absent fallback; `:3607` the
    `parseToolsEntry` delegation that discharges 0069 constraint 5, with the
    malformed arm contributing nothing (`:3608–3610`); `:3611–3613` the rename
    arm; `:3615–3617` the default-name derivation. `:3586–3599` is the doc
    comment, which states the presented names are "post-`as` /
    post-hyphen→underscore" and that "production always takes the snapshot
    arm". `:222` is the `parseToolsEntry` import.
  - `src/extension/production-theta-producer.ts:615–618` —
    `thetaCallableName`, which `:3616` calls for a non-identifier spec. It
    strips the `.theta` extension after normalising `\` to `/` and does not map
    hyphens to underscores.
  - `src/parser/callable-set.ts:387–391` — `thetaDefaultName`, the resolver's
    derivation for the same input: basename, extension stripped,
    `stem.replace(/-/g, "_")`. `:344` is the Pi-tool arm (the name verbatim)
    and `:219` is `parsed.rename ?? resolution.defaultName`. These are the
    three derivations (D2) pins.
  - `src/parser/callable-set.ts:307–316` — `parseToolsEntry`, the shared closed
    grammar: one token, or three with `as` in the middle; every other count is
    `malformed` (`:315`). `:292–306` is its doc comment, whose export rationale
    is this lock-step ("Exported so `presentedCallableNames` … answers 'which
    entries exist' from the SAME grammar `resolveCallableSet` enforces", `:302–306`).
    `:257–259` is `ToolsEntryParse`. `:180–197` is the resolver's malformed arm
    (`theta/load/malformed-tool-entry`, error severity, `continue`), which
    un-registers the theta.
  - `src/extension/production-theta-producer.ts:3637–3674` —
    `buildBoundEnvironment`, which passes the name list as
    `callables: callableNames` (`:3660`). Its doc comment (`:3628–3635`) states
    the consumer: "The theta's presented callable names populate the
    environment's arm-4 callable registry (bug 0016): the
    `localShadowsCallable` dispatch guard needs callable-set membership to fire
    only where the parse gate … fires".
  - `src/runtime/lexical-environment.ts:462–476` — `localShadowsCallable`. Its
    first test is `root.callables.has(name)` (`:464–466`), so registry
    membership is decidable from outside the module through the belt's throw.
    This is the behavioural observable the 0069 disposition records as absent.
  - `src/runtime/tool-call.ts:476–483` —
    `ShadowedCalleeDispatchDefectError`, the belt's throw and the message quoted
    in §Reproduction.
  - `src/extension/reload-wiring.ts:73–82` — `ParsedTheta.callableSet?`, the
    optional field whose absence selects the fallback: "Absent → the runtime
    falls back to the producer-wide resolver (in-memory fixtures) rather than
    the frozen set."
  - `src/extension/production-composition.ts:1479–1509` — the production load
    path. A registered theta always carries a snapshot (`:1492`
    `result.callableSet ?? EMPTY_CALLABLE_SET`, `:1498–1507`), so the fallback
    arm is reached by in-memory fixtures only. This bounds the divergence's
    blast radius and is why the fallback's answer is a test-surface property
    rather than a production one.
  - `src/parser/theta-document.ts:4505–4519` — `toolCallableName`, the parse
    gate's third derivation of the same name. It splits on whitespace, takes
    `parts[2]` after `as`, and maps hyphens to underscores (`:4518`), so the
    gate agrees with the resolver on `./code-review.theta` and with neither on a
    malformed entry (0106's subject; measured here as the third answer).
    `:4824–4831` is `piToolCallableName`, its Pi-tool-only companion.
  - `src/parser/frontmatter.ts:148–155` — `ParsedFrontmatter.tools`, the
    fallback's input.
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md:84` — the normative
    derivation: "the default name is the file's basename without the `.theta`
    extension, with **hyphens replaced by underscores**
    (`./code-review.theta` → `code_review`)". Mirrored at
    `docs/reference/frontmatter.md:127`. The resolver and the parse gate
    implement it; the fallback does not.
  - `AGENTS.md:111–115` — §"Verify both directions when adding or strengthening
    an assertion": "A live assertion that cannot red is worthless. After
    strengthening, prove the red path once … then restore and confirm green."
    Stated for the live axis; the obligation is about assertions, and this
    witness is offline.
  - `tests/di-seam-skeleton.test.ts:225–247` — the footing (D1) cites: a scan of
    the real `src/**` tree for banned ambient primitives (`:241–245`). The
    property asserted there IS a source-shape property (a convention ban on
    direct references), so the scan is the property's direct measurement. In
    (D1) the source shape stands in for a behavioural agreement, which is the
    difference this report is about.
  - **The existing drives.**
    `tests/conformance/production-conformance.test.ts:152–176` (`runSource`)
    builds a `ThetaCompositionInput` from a real parse with **no**
    `callableSet` (`:166–171`) and drives `bindPromptConversation` +
    `executeBody`, so it already exercises the fallback arm — including one
    `tools:`-bearing cell (`:551–578`, `tools:\n  - grep`).
    `tests/shadowed-callable-call.test.ts:463–578` is the same shape with a
    recording Pi tool, and asserts the belt (`:586–594`); it passes a snapshot
    (`:522–531`, `:576`), so it takes the snapshot arm. Between them the two
    harnesses supply everything route (b) needs.
  - `tests/tools-entry-closed-grammar.test.ts` (665 lines) — 0069's other
    witness. Group (A) is the registry row (`:172`), group (B) the production
    load path over a real on-disk `.pi/theta/` workspace (`:315`, cells at
    `:349`–`:513`), group (C) `resolveCallableSet` directly (`:516–517`,
    `:575`–`:665`). Every (B) cell loads from disk and therefore resolves a
    snapshot; no cell in either witness file reaches the snapshot-absent
    fallback.
- **Observed at:** `0.62.0` (HEAD `99b65438`). Offline, deterministic; no live
  model, no provider. One scratch `vite-node` probe: the witness's own scan
  function and its two regexes applied to the real source and to three
  substituted bodies, the real exported `parseToolsEntry` /
  `resolveCallableSet`, and the real `parseThetaDocument` →
  `createProductionProducerDeps().bindPromptConversation` → `executeBody` over
  thetas carrying no `callableSet`. Written under the gitignored `.pi/tmp/`,
  run, deleted. No file under `src/`, `tests/` or `docs/` was modified.

## Summary

Bug 0069 §Fix constraint 5 requires that `presentedCallableNames`
(`src/extension/production-theta-producer.ts:3600`) not hold a second answer to
which `tools:` entries exist. The fix discharged it by deleting the function's
whitespace split and calling the exported `parseToolsEntry` (`:3607`). The
witness for that is `tests/tools-entry-closed-grammar-lockstep.test.ts` group
(D1), two cells asserting that the function's source slice matches neither
`/\bsplit\(/` (`:95`) nor `/["']as["']/` (`:103`).

Those two regexes are the spellings the deleted body used. Any other tokeniser
passes them. Measured: a body using `entry.trim().match(/\S+/g)` plus
`entry.includes(" as ")`, and a body using `indexOf(" as ")` plus
`search(/\s/)`, both pass both cells — while answering `read` for the malformed
entry `read bash`, `read` for `read as`, and `junk` for
`read as file_read junk`, each of which the resolver rejects outright with
`theta/load/malformed-tool-entry` and no entry at all. The drift constraint 5
exists to prevent is fully reinstated by a body the gate calls clean. A
reconstruction of the pre-fix shape reds both cells, so the gate discriminates
one spelling of the defect, not the defect.

Group (D2) is the file's behavioural half and is one-sided. Its comment states
its subject as "the three derivations a delegating fallback has to reproduce
verbatim: the Pi-tool name unchanged, the basename with hyphens mapped to
underscores, and the `as` target in place of either default" (`:146–148`), and
it then calls `resolveCallableSet` and nothing else (`:149–153`). The fallback
does not reproduce the second one: for `./code-review.theta` the resolver's
`thetaDefaultName` yields `code_review` (`src/parser/callable-set.ts:387–391`,
and `frontmatter-fields-a.md:84` states the rule) while the fallback's
`thetaCallableName` yields `code-review`
(`production-theta-producer.ts:615–618`, called at `:3616`). Measured through a
real producer drive: with the presented name `code-review` in the environment's
arm-4 registry, a shadowed call of `code_review` does not trip the bug-0016
dispatch belt, while the parse gate — a third derivation,
`toolCallableName` (`src/parser/theta-document.ts:4505–4519`) — does emit
`theta/parse/shadowed-callable-call` for the same source. Two readers disagree
at HEAD on a well-formed entry, the third sides with the resolver, and all three
cells of the lock-step pass.

The same drive is the behavioural observable the 0069 disposition records as
absent. `localShadowsCallable` tests `root.callables.has(name)` first
(`src/runtime/lexical-environment.ts:464–466`), so the presented-name list is
readable from outside the module: a shadowed call of a presented name rejects
with `ShadowedCalleeDispatchDefectError`, and a name the fallback drops does
not. Both harnesses needed for it already exist in the offline suite
(`tests/conformance/production-conformance.test.ts:152–176` already drives the
fallback arm; `tests/shadowed-callable-call.test.ts:463–578` already asserts the
belt), and the whole five-cell probe below ran in 2.2 s wall.

## Reproduction

Offline, at `99b65438`. One scratch `vite-node` probe, three parts. Part 1
copies `topLevelFunctionBody` (`tests/tools-entry-closed-grammar-lockstep.test.ts:64–80`)
and the two regexes (`:95`, `:103`) verbatim and applies them to bodies. Part 2
imports the real exported `parseToolsEntry` / `resolveCallableSet`. Part 3 drives
the real `parseThetaDocument` → `createProductionProducerDeps` →
`bindPromptConversation` → `executeBody` over thetas built with
`frontmatter` from the parse and **no** `callableSet`, in the shape
`tests/conformance/production-conformance.test.ts:152–176` uses, with a
`resolvePiTool` double that resolves any name and returns the sentinel
`AMBIENT-EXECUTED`.

### The witness at HEAD

```
npx vitest run tests/tools-entry-closed-grammar-lockstep.test.ts
  Test Files  1 passed (1)
       Tests  3 passed (3)
```

### (D1)'s verdicts over four bodies

`PASS` = the regex does not match, i.e. the cell passes. V0 is the real HEAD
slice. V1 is a reconstruction of the pre-fix shape (a whitespace split plus
`parts[1] === "as"`), not the pre-fix bytes. V2 and V3 are re-tokenisations
that answer the same question with no `split(` and no quoted `as`.

```
@@ V0  real HEAD body                                        split-cell PASS   as-cell PASS
@@ V1  pre-fix-SHAPED reconstruction                         split-cell RED    as-cell RED
@@ V2  match(/\S+/g) + includes(" as ")                      split-cell PASS   as-cell PASS
@@ V3  indexOf(" as ") + search(/\s/)                        split-cell PASS   as-cell PASS
@@ V2  substituted into the whole file, then scanned         split-cell PASS   as-cell PASS   (slice == V2: true)
@@ V3  substituted into the whole file, then scanned         split-cell PASS   as-cell PASS   (slice == V3: true)
```

The last two rows substitute the variant into the real source string and re-run
the scan, so the scan relocates its subject and reaches the same verdict. The
gate's only input is `readFileSync` of one path (`:51–56`), so substituting in
memory and editing the file on disk are the same measurement.

### What the two answers are, for the same entries

`resolver` is the real `resolveCallableSet` over Pi tools `read` / `bash` /
`grep` and the callee `./code-review.theta`; `V2` is that evasive body's
entry-grammar answer — the spec, or the rename target when it finds one, before
the basename derivation.

```
@@ ["read bash"]                resolver registered=false names=[]   parseToolsEntry {"kind":"malformed"}   V2 ["read"]
@@ ["read as"]                  resolver registered=false names=[]   parseToolsEntry {"kind":"malformed"}   V2 ["read"]
@@ ["read as file_read junk"]   resolver registered=false names=[]   parseToolsEntry {"kind":"malformed"}   V2 ["junk"]
@@ ["./code-review.theta"]      resolver registered=true  names=["code_review"]                             V2 ["./code-review.theta"]
@@ ["grep as searcher"]         resolver registered=true  names=["searcher"]                                V2 ["searcher"]
```

Rows 1–3 are the disagreement constraint 5 forbids: a presented name where the
resolver has none and un-registers the theta. A body producing them passes both
(D1) cells.

### The fallback arm through a real producer drive

Each cell is one `.theta` source with `mode: prompt`, the `tools:` entry shown,
a local shadowing the name under test, and a call of it. `parse` is the
error-severity code list from `parseThetaDocument`; `runtime` is the
`executeBody` outcome or the thrown error.

```
@@ C  tools: - read                 + `let read = "x"` + `read({ path: "p" })?`
      parse   ["theta/parse/shadowed-callable-call","theta/parse/bare-object-literal"]
      runtime THROW ShadowedCalleeDispatchDefectError: internal defect: call of 'read' reached the
              runtime lowering although the call site lexically resolves to a local binding that
              shadows the callable-set entry 'read'; … (bug 0016)

@@ R  tools: - grep as searcher     + `let searcher = "x"` + `searcher({ path: "p" })?`
      parse   the same two codes
      runtime THROW ShadowedCalleeDispatchDefectError (… 'searcher' …)

@@ H  tools: - ./code-review.theta  + `let code_review = "x"` + `code_review({ path: "p" })?`
      parse   the same two codes
      runtime outcome=ok value="AMBIENT-EXECUTED"

@@ H2 tools: - ./code-review.theta  + `code_review({ path: "p" })?`   [no shadow]
      parse   ["theta/parse/bare-object-literal"]
      runtime outcome=ok value="AMBIENT-EXECUTED"

@@ M  tools: - read bash            + `let read = "x"` + `read({ path: "p" })?`
      parse   ["theta/parse/shadowed-callable-call","theta/parse/bare-object-literal"]
      runtime outcome=ok value="AMBIENT-EXECUTED"
```

C and R are the observable: a presented name in the arm-4 registry plus a local
shadow rejects through the bug-0016 belt, and the tool never executes. H is the
divergence: the parse gate derives `code_review` and fires
`theta/parse/shadowed-callable-call`, the resolver's snapshot key for the same
entry is `code_review` (row 4 of the previous block), and the belt does not
fire — so the registry holds `code-review`. The `AMBIENT-EXECUTED` value is the
harness double resolving any name, which is what a snapshot-absent fixture falls
back to (`src/extension/reload-wiring.ts:79–80`); it is the drive completing, not
a second defect. M is the post-fix delegation working: the malformed entry
yields no presented name, so no belt fires. Under a re-tokenising body M's
presented name is `read` (measured in the previous block), which is C's
configuration, so M throws — this is the cell route (b) would add, and (D1) is
not needed for it.

## Expected behaviour

- **A witness reds on the class it guards, not on one spelling of it.**
  `AGENTS.md:111–115` states the rule for the live axis — "A live assertion that
  cannot red is worthless", and the obligation to prove the red path once after
  strengthening. The rule is about assertions; nothing in it is specific to the
  live runner, and 0048 is filed against the same sentence for an offline-visible
  vacuity in a live file. (D1) reds against one reconstruction of the deleted
  body and passes against two re-tokenisations that reinstate the same
  disagreement (measured), so its red set is a subset of its defect class.
- **The obligation is agreement between two readers.** 0069 §Fix constraint 5
  (`:438–441`) states it as a disagreement to prevent: the fallback "must move in
  lock-step or it will disagree with the resolver about which entries exist".
  The property is therefore observable by comparing the two answers for one
  entry. A witness for it observes both readers. (D1) observes one reader's
  source text; (D2) observes the other reader's output.
- **A behavioural witness observes the entry set both readers derive for a
  malformed entry.** For `- read bash` the resolver produces no entry and
  un-registers (`src/parser/callable-set.ts:180–197`); a lock-stepped fallback
  produces no presented name. Cell M above is that comparison, and cell C is its
  positive control: the same shape with a well-formed entry rejects through the
  belt, so the assertion has a proven red direction.
- **(D2)'s stated subject includes the fallback.** Its comment names "the three
  derivations a delegating fallback has to reproduce verbatim"
  (`:146–148`). Two derivations are the same on both sides; the third is not
  (`code-review` against `code_review`, measured), and
  `frontmatter-fields-a.md:84` says which one is correct. A cell whose subject is
  what both sides must produce asks both sides.
- **The structural obstacle the disposition records is one arm of one
  function.** 0069 records the function as "module-private with no cheap
  behavioural observable (its only reach is a full bind-and-execute producer
  drive whose observable is the environment's callable registry, not the name
  list)" (`:198–207`). The premise is accurate about the reach and incomplete
  about the observable: the registry's membership test is the first line of
  `localShadowsCallable` (`src/runtime/lexical-environment.ts:464–466`), the belt
  throws by name, and two harnesses in the offline suite already drive that path
  (`tests/conformance/production-conformance.test.ts:152–176`,
  `tests/shadowed-callable-call.test.ts:463–578`).

## Actual behaviour / root cause

**The assertion enumerates the old implementation's byte sequences.**

```ts
    ).not.toMatch(/\bsplit\(/);
```

```ts
    ).not.toMatch(/["']as["']/);
```

`tests/tools-entry-closed-grammar-lockstep.test.ts:95`, `:103`. The first names
the method the deleted body called; the second names the literal it compared
against. Both are absence assertions, so the cell's verdict is "the body does
not contain these two things" and never "the body delegates". `/["']as["']/`
requires a quote adjacent to `as`, so `includes(" as ")` is outside it by two
spaces. `/\bsplit\(/` is outside `match(/\S+/g)`, `search(/\s/)`, `indexOf`, and
any hand-rolled index scan. The evasive bodies measured in §Reproduction are
ordinary re-tokenisations, not adversarial constructions.

**The scan is otherwise sound.** `topLevelFunctionBody` (`:64–80`) throws when
its subject is missing or unterminated, so a rename or a move cannot produce a
vacuous pass, and the whole-file substitution rows confirm the scan relocates
its subject correctly. The defect is the predicate applied to the slice, not the
slice.

**(D2) never crosses the seam.** The file imports `resolveCallableSet`,
`CallableSetDeps`, `CallableSetResult` and `ToolsField` from
`../src/parser/callable-set` and imports nothing from the producer module
(`:4–9`). `resolveList` (`:131–142`) calls the resolver; the cell reads
`r.callableSet?.entries.keys()` (`:157–161`). Every value in the group comes
from one reader, so the group cannot detect a fallback that derives a different
name — and one does.

**The two derivations differ.**

```ts
function thetaCallableName(path: string): string {
  const base = path.slice(path.replace(/\\/g, "/").lastIndexOf("/") + 1);
  return base.endsWith(".theta") ? base.slice(0, -".theta".length) : base;
}
```

`src/extension/production-theta-producer.ts:615–618`, called at `:3616`.

```ts
function thetaDefaultName(thetaPath: string): string {
  const basename = thetaPath.slice(thetaPath.lastIndexOf("/") + 1);
  const stem = basename.endsWith(".theta") ? basename.slice(0, -".theta".length) : basename;
  return stem.replace(/-/g, "_");
}
```

`src/parser/callable-set.ts:387–391`, reached from `:219`. The second maps
hyphens to underscores and the first does not; the first normalises `\` to `/`
and the second does not. `frontmatter-fields-a.md:84` states the hyphen rule
normatively, and the fallback's own doc comment claims it
(`production-theta-producer.ts:3587`, "post-`as` / post-hyphen→underscore").
So the fallback both contradicts the spec sentence and contradicts its own
comment for a `.theta` entry whose basename carries a hyphen — the exact input
(D2) pins on the other side.

**The divergence's reach is the test surface.** For a registered theta the
production load path always attaches a snapshot
(`src/extension/production-composition.ts:1492`, `:1498–1507`), and
`presentedCallableNames` returns the snapshot's keys when one is present
(`:3601–3604`). The fallback arm is reached by in-memory fixtures, which is what
`ParsedTheta.callableSet?` documents (`src/extension/reload-wiring.ts:79–80`)
and what the fallback's comment asserts. That bounds the consequence and is also
why a source-shape gate was chosen: the arm has no production observable. It
does have a test observable, exercised today by
`tests/conformance/production-conformance.test.ts:551–578`.

**Nothing else in the tree covers the seam.** `tests/tools-entry-closed-grammar.test.ts`
group (B) drives the real production load path over an on-disk workspace
(`:315`), so every one of its cells resolves a snapshot and takes the snapshot
arm; group (C) is `resolveCallableSet` direct (`:516–517`). Between the two
witness files, 31 cells cover the grammar and the load-time rejection, and the
fallback's own output is asserted nowhere.

**The witness header describes the pre-fix state.** `:11–21` and `:39–44` cite
the declaration at `:3595` (it is `:3600`), describe `:3600–3607` as a
whitespace split (that range is the delegating loop), and state that (D1) is red
"WHAT IS RED HERE AND WHY: (D1) the fallback still carries its own
whitespace-split token grammar". All three cells pass at HEAD. A reader auditing
the gate's strength starts from a description of the code the gate was written
against.

## Why it matters

- **The constraint is unwitnessed against its own class.** 0069's §Fix names
  constraint 5 as one of five, and its verification records "seam 3 alone reds
  the two constraint-5 cells" (`:142–143`) — a red proven against one body. Two
  re-tokenisations that restore the pre-fix disagreement pass both cells
  (measured). A future edit to `presentedCallableNames` that drops the shared
  call is uncaught, and the fix report's own residual predicted exactly that.
- **The disagreement is already live, in the direction (D2) claims to cover.**
  The fallback presents `code-review` where the resolver's snapshot key and the
  parse gate's derivation are both `code_review`, and
  `frontmatter-fields-a.md:84` makes `code_review` the specified answer. Three
  readers, two answers, three green cells. The lock-step's premise — that
  sharing the grammar makes disagreement impossible — holds for the grammar half
  and not for the derivation half.
- **A presented name that is not identifier-shaped is unreachable by name.**
  `code-review` cannot be written as a theta identifier, so for a snapshot-absent
  fixture the arm-4 registry holds an entry nothing in the body can name, and the
  bug-0016 dispatch belt is inert for that callable (cell H). The belt exists so
  that runtime dispatch fires exactly where the parse gate fires
  (`production-theta-producer.ts:3628–3635`); on this arm the parse gate fires and
  the belt does not.
- **The class is tracked in this repo.** 0048 is open against one live assertion
  that cannot red, filed on `AGENTS.md:111–115`;
  [0030](./0030-h9a-stderr-gate-gap-and-stale-intended-red-header.md) is fixed
  (0.35.0) against stderr lines "the 0018/0021/0022 fix records cite as live
  regression evidence" passing every H9a area green (`:1`). A gate whose red set
  is one spelling of its defect is the same class one level in: it holds while
  nobody rewrites the function, and stops holding silently.
- **The cheapest strict improvement replaces two absence assertions with one
  presence assertion.** Requiring the body to call `parseToolsEntry` closes every
  re-tokenisation, because a body that does not call the shared grammar fails it
  regardless of how it tokenises. Nothing in the fix needs a new diagnostic code,
  a spec edit, or a change under `src/`.

## Non-goals

- **The three entry-grammar derivations outside the lock-step.**
  `toolsEntrySpec` (`src/extension/production-composition.ts:1583–1586`),
  `toolCallableName` (`src/parser/theta-document.ts:4505–4519`) and
  `piToolCallableName` (`:4824–4831`) each re-derive a spec or a presented name
  with their own whitespace split. `toolCallableName` supplies the third answer
  measured in §Reproduction, and the M cell shows the parse gate emitting
  `theta/parse/shadowed-callable-call` for the malformed entry `read bash`. That
  is 0106's subject; this report measures it as evidence about the witness's
  coverage and does not adjudicate it.
- **Whether the snapshot-absent fallback should exist.** The arm is the pattern
  `thetaCalleePath` / `#resolvePiToolForTheta` use for in-memory fixtures
  (`production-theta-producer.ts:3590–3592`). Removing it, or requiring every
  fixture to carry a resolved snapshot, is a separate change and would dissolve
  this witness's subject rather than fix its assertion.
- **The bug-0016 dispatch belt.** It is used here as an observable of the arm-4
  registry, unmodified. Its known residual for a `params:`-field shadow inside a
  `subagent fn` body (`src/runtime/lexical-environment.ts:451–460`) is not
  reached by any cell above.
- **`tests/di-seam-skeleton.test.ts`' source scan.** A convention ban on direct
  references to ambient primitives is a source-shape property, so scanning source
  measures it directly. Nothing here argues against that gate or against source
  scans generally.
- **The `AMBIENT-EXECUTED` outcome in cells H, H2 and M.** A snapshot-absent
  fixture falls back to the producer-wide resolver by design
  (`src/extension/reload-wiring.ts:79–80`), and the probe's double resolves every
  name so the drive is visible. Whether that fallback is itself correct is
  outside this report.

## Fix

Not settled. The subject is one test file; four dispositions are available, and
(c) is recommended.

**(a) Export `presentedCallableNames`, or a thin seam over it, and assert the
entry set directly.** A cell calls the function with a theta carrying
`frontmatter.tools = ["read bash"]` and no `callableSet` and asserts the empty
list, and with `["./code-review.theta"]` and asserts `["code_review"]`. This is
the most direct witness of the property. The cost is a wider module surface
whose only consumer is a test: the function is currently in no `export` of
`src/extension/production-theta-producer.ts`, and the witness's own TIER
paragraph records that privacy as the reason it scanned source instead
(`tests/tools-entry-closed-grammar-lockstep.test.ts:28–31`). Taking this route
overrides that record deliberately rather than by omission.

**(b) Reach it through the producer drive and assert the registry.** Measured
feasible in §Reproduction. The harness exists twice:
`tests/conformance/production-conformance.test.ts:152–176` (`runSource`) already
builds a `ThetaCompositionInput` with no `callableSet` and drives
`bindPromptConversation` + `executeBody`, and
`tests/shadowed-callable-call.test.ts:463–578` adds the recording Pi tool and the
belt assertion (`:586–594`) while passing a snapshot (`:522–531`). The cell is
that shape with the snapshot omitted and the frontmatter taken from the parse:
cell M (malformed entry, shadowed local, no belt) with cell C as its positive
control (well-formed entry, shadowed local, `ShadowedCalleeDispatchDefectError`).
Cost: the whole five-cell probe ran in 2.2 s wall including transform, offline,
provider-free. This is the only disposition that observes agreement rather than
the shape of one side, and it makes the red direction provable without editing
`src/`.

**(c) Keep the source scan and make it a whitelist — recommended.** Replace the
two absence assertions (`:95`, `:103`) with a presence assertion: the scanned
body must contain a call to `parseToolsEntry`. A blacklist enumerates spellings
of the defect, so every unlisted spelling passes — which is what the two
measured evasions exploit. A whitelist names the delegation, which is the
property constraint 5 states, so a body that answers "which entries exist" with
`match(/\S+/g)`, `indexOf(" as ")`, or any other tokeniser fails it: dropping the
shared call is the one thing every re-tokenisation must do. The improvement is
strict — nothing that reds today goes green (the pre-fix-shaped reconstruction
carries no `parseToolsEntry` call and reds under both forms) — and the limit is
stated rather than hidden: a body that calls `parseToolsEntry` and then ignores
its verdict satisfies a whitelist too, so (c) closes the named evasion class and
does not prove agreement. (c) and (b) compose; (c) alone is the cheapest strict
improvement.

**(d) Leave as found and re-record the disposition.** The status quo. Its cost is
that the recorded reason ("no cheap behavioural observable") is now measured to be
incomplete, so leaving the gate keeps a record that would have to be corrected
anyway.

Constraints on any of (a)–(c):

1. **The red direction is proven once, at the axis the gate runs on.** For (c):
   a body with the shared call removed must red the new cell. For (b): cell C is
   the control that the belt observable fires at all, and cell M's red is proven
   by temporarily restoring a tokenising body — whose presented name for
   `read bash` is `read` (measured), i.e. cell C's configuration. Neither proof
   needs a live provider. Per `AGENTS.md:111–115`, prove the red, then restore
   and confirm green.
2. **The existing cells stay or are subsumed, not weakened.** Group (D2)'s
   assertion on the resolver's three derivations
   (`tests/tools-entry-closed-grammar-lockstep.test.ts:149–161`) is correct and
   stays. `topLevelFunctionBody`'s two loud throws (`:65–78`) stay: whatever the
   predicate becomes, a missing subject must not read as a pass.
   `tests/tools-entry-closed-grammar.test.ts` is untouched, and the two files'
   31 cells (0069 §Fix, `:109–111`) change only by whatever (D1) becomes.
3. **The header is re-derived in the same change.** `:11–21` and `:39–44` cite
   `:3595` for a declaration now at `:3600`, describe `:3600–3607` as a
   whitespace split where that range is the delegating loop, and state that (D1)
   is red. Any edit to (D1) restates what the group asserts and what is green.
4. **The name divergence is dispositioned explicitly.** The fallback presents
   `code-review` where the resolver, the parse gate and
   `frontmatter-fields-a.md:84` all say `code_review` (measured). The run either
   closes it — one line at `production-theta-producer.ts:3616`, reusing the
   resolver's derivation instead of `thetaCallableName` — or records it as
   filed-separately. Closing it needs no spec edit, because the spec already
   states the rule, and adds no diagnostic code. If it is closed, cell H becomes
   a second behavioural cell (the belt fires for a shadowed `code_review`), which
   is the strongest available witness that both readers agree.
5. **No `theta/*` code and no spec text is involved.** Dispositions (b), (c) and
   (d) touch one test file; (a) additionally widens one module's exports;
   constraint 4's optional line changes a derivation the spec already specifies.
   No registry row is added, no message text changes, and no input's
   diagnostic-code sequence changes on the production load path, which always
   resolves a snapshot (`src/extension/production-composition.ts:1492`,
   `:1498–1507`). DIAG-2 and GOV-15 are therefore not reached: this is a
   test-surface change.
6. **Coordination with 0106.** 0106's subject is the three derivations outside
   the lock-step, one of which (`toolCallableName`) is the parse gate's answer
   measured here. If either fix edits
   `tests/tools-entry-closed-grammar-lockstep.test.ts`, whichever lands second
   rebases on the first. Neither blocks the other.

## Provenance

- Origin: the bug 0069 fix (0.62.0), §Fix *Residuals* item 4
  (`docs/bugs/0069-tools-entry-residue-silently-dropped.md:198–207`, reviewer
  finding R4(a), verification round 3), which records the gate's form, the reason
  for it, the red proof against the pre-fix body, and the evasion it does not
  cover: "a novel re-tokenisation (`match(/\S+/g)`, `includes(" as ")`) would
  evade it. Reshape only if a behavioural observable appears." This report is
  that filing, and adds what the residual states as a possibility: the evasion
  measured for two spellings, the whole-file substitution equivalence, the
  entry-set answers the evasive bodies produce against the resolver's, the
  behavioural observable (the arm-4 registry through the bug-0016 belt) with the
  two existing harnesses that reach it and a measured run cost, and the
  `code-review` / `code_review` divergence that (D2)'s stated subject covers and
  its assertion does not.
- Related reports: 0069 §Fix constraint 5 (`:438–441`), its shipped-list entry
  for the producer (`:89–93`), its verification finding "seam 3 alone reds the
  two constraint-5 cells" (`:142–143`), and its witness-surface pointer for the
  next orchestrator (`:235`); 0069 §Fix *Residuals* item 3 (`:186–197`), which 0106
  files; [0048](./0048-double-session-start-live-vacuous-quiesce-witness.md) (the
  class sibling and its `AGENTS.md:111–115` framing).
- Repo conventions: `AGENTS.md:111–115` (§"Verify both directions when adding or
  strengthening an assertion").
- Spec: `docs/spec_topics/frontmatter/frontmatter-fields-a.md:84` (the `.theta`
  default-name derivation, hyphens → underscores), mirrored at
  `docs/reference/frontmatter.md:127`.
- Implementation evidence at `99b65438`:
  `src/extension/production-theta-producer.ts:222` (the `parseToolsEntry`
  import), `:615–618` (`thetaCallableName`), `:1212`, `:1493`, `:1739` (the three
  call sites), `:3586–3599` (the doc comment), `:3600–3620`
  (`presentedCallableNames`: `:3601–3604` the snapshot arm, `:3605–3619` the
  fallback, `:3607` the delegation, `:3608–3610` the malformed arm, `:3611–3613`
  the rename arm, `:3615–3617` the default-name derivation), `:3628–3635` /
  `:3637–3674` (`buildBoundEnvironment` and `:3660` the arm-4 registry);
  `src/parser/callable-set.ts:180–197` (the resolver's malformed arm), `:219`
  (the presented name), `:257–259` (`ToolsEntryParse`), `:292–316`
  (`parseToolsEntry` and its export rationale), `:344` (the Pi-tool default
  name), `:387–391` (`thetaDefaultName`);
  `src/runtime/lexical-environment.ts:451–460` (the belt's recorded residual),
  `:462–476` (`localShadowsCallable`); `src/runtime/tool-call.ts:476–483`
  (`ShadowedCalleeDispatchDefectError`);
  `src/extension/reload-wiring.ts:73–82` (`callableSet?` and the fallback
  sentence); `src/extension/production-composition.ts:1479–1509` (the load path
  always attaching a snapshot), `:1583–1586` (`toolsEntrySpec`);
  `src/parser/theta-document.ts:4505–4519` (`toolCallableName`), `:4824–4831`
  (`piToolCallableName`); `src/parser/frontmatter.ts:148–155`
  (`ParsedFrontmatter.tools`).
- Test evidence at `99b65438`:
  `tests/tools-entry-closed-grammar-lockstep.test.ts:4–9` (the imports),
  `:11–21` / `:28–37` / `:39–44` / `:46–47` (the header),
  `:51–56` (`PRODUCER_SOURCE`), `:64–80` (`topLevelFunctionBody`), `:86–105`
  (group (D1), assertions at `:95` and `:103`), `:111–142` (the (D2) helpers),
  `:144–163` (group (D2), its comment at `:146–148`, its assertions at
  `:154–161`);
  `tests/tools-entry-closed-grammar.test.ts:172` (group (A)), `:191–192` /
  `:315` (group (B) and its production load path), `:516–517` (group (C));
  `tests/conformance/production-conformance.test.ts:152–176` (`runSource`,
  `:166–171` the snapshot-absent input), `:551–578` (its `tools:`-bearing cell);
  `tests/shadowed-callable-call.test.ts:122` (the shared frontmatter),
  `:463–578` (the producer-level harness, `:522–531` `thetaWithSet`, `:564–578`
  `bindParsedSource`), `:586–594` (the belt assertion);
  `tests/di-seam-skeleton.test.ts:225–247` (the real-tree source scan (D1)
  cites).
- Reproduction: one scratch `vite-node` probe at `99b65438` — the witness's scan
  function and its two regexes verbatim over the real slice, a pre-fix-shaped
  reconstruction and two re-tokenisations (the two re-tokenisations also
  substituted into the whole source string and re-scanned); the real exported
  `parseToolsEntry` /
  `resolveCallableSet` over five entry lists beside the evasive tokeniser's
  answers; and five producer drives through the real `parseThetaDocument` →
  `createProductionProducerDeps().bindPromptConversation` → `executeBody` with no
  `callableSet`. Plus `npx vitest run
  tests/tools-entry-closed-grammar-lockstep.test.ts` (`Tests 3 passed (3)`). Run
  on the outputs quoted above, then deleted. The probe lived under the
  gitignored `.pi/tmp/`; no file under `src/`, `tests/` or any other bug doc was
  modified by this filing.
