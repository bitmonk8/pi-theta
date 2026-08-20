# Bug 0207 — twenty-four comment and title sites in fourteen `tests/**` files still call `discoverAndComposeFixtures` "the shipped composition root" after bug 0183 corrected the same false attribution at its ten enumerated sites: at HEAD `rg -n 'discoverAndComposeFixtures' src/ extensions/` returns one declaration (`src/extension/production-composition.ts:366`) and three comments and no caller, while the shipped `session_start` root is `composeExtensionInstance` (`:1214`), wired `extensions/index.ts:13` → `src/extension/factory.ts:1146`

- **Status:** open
- **Sev/Diff estimate:** S4/D1 — a record that misdescribes a surface whose
  behaviour is correct (the bug 0112 class, and 0183's own class and estimate):
  no author-visible behaviour, no runtime path and no test outcome depends on
  the prose, and the ceiling is a reader who believes the offline suites reach
  the shipped `session_start` wiring they never enter. D1 because every edit is
  a comment token, the substitution is fixed by 0183 §Fix item 4, and the only
  executable-line hunks are two `describe` titles whose rename moves reporter
  output.
- **Kind:** documentation defect in test-file comments and two `describe`
  titles. No spec sentence is violated and no `theta/*` code, REQ-ID, registry
  row or plan leaf is engaged. The applicable in-tree rule is
  `docs/STYLE.md:26` §Claims — "Every claim is testable or is removed" — and
  each claim below is testable by one `rg` and false.
- **Affected** (every citation verified against the tree at HEAD `5a92a36c`,
  v0.129.0, by `rg` and by reading each file; the load call each site
  mis-attributes is named beside it):
  - `tests/ctor-unresolved-schema-name.test.ts` — `:79` (file-header cell
    inventory), `:506` (group (5) banner), `:510`
    (`describe("bug 0025 (5) load consequence — the shipped composition root
    refuses the theta")`, a title). The file's only load call is
    `discoverAndComposeFixtures` at `:548`; the `it` title at `:511` names that
    symbol and is correct.
  - `tests/typeenv-prototype-names.test.ts` — `:135` (tier block), `:642`
    (group (d) banner), `:656` (the `driveComposePass` docstring). Load call:
    `:693`.
  - `tests/invoke-arg-type-mismatch-wired.test.ts` — `:43–44` (header, the
    parenthetical identity "the shipped composition root
    (`discoverAndComposeFixtures`)"), `:421` (`LoadOutcome.registered`
    docstring). Load call: `:469`.
  - `tests/conformance/production-conformance.test.ts` — `:73`. This is bug
    0183's own subject file: the header clause at `:47–48` and three downstream
    repetitions were corrected in 0.129.0, and this fourth one — 0183 §Affected
    cited it as `:67`, +6 lines under that fix's header growth — was not.
    Load call: `:262`.
  - `tests/production-tools-load-resolution.test.ts` — `:23–24` (the
    parenthetical identity "`discoverAndComposeFixtures` (the shipped
    `session_start` composition root)"), `:810`
    (`LoadOutcome.registered` docstring). Load call: `:839`.
  - `tests/tools-field-shape-refusal.test.ts` — `:130` (group (D) observable
    table preamble), `:656–657` (the (D3)/(D4) banner, "the shipped
    `session_start` composition root"), `:668`
    (`LoadOutcome.registered` docstring). Load call: `:726`.
  - `tests/e2e-s5-package-discovery-composition-root.test.ts` — `:43` (the
    `runProductionLoad` docstring). 0183 §Fix item 2 corrected `:11–12` in this
    file and left `:43`. Load call: `:60`.
  - `tests/empty-query-annotation.test.ts` — `:1032` (cell RT-load's
    comment). The `it` title at `:1028` names the symbol and is correct. Load
    call: `:1074`.
  - `tests/prompt-mode-extension-tool-reach-e2e.test.ts` — `:77` (the fake
    parent-host docstring), `:230` (`describe("bug 0001 e2e — prompt-mode
    code-side extension-tool reach through the shipped composition root")`, a
    title). 0183 §Fix item 2 corrected `:2` in this file. Load call: `:222`.
  - `tests/subagent-fn-extension-tool-dispatch-e2e.test.ts` — `:124` (the fake
    parent-host docstring), `:239` (section banner). 0183 §Fix item 2 corrected
    `:19`. Load call: `:251`.
  - `tests/theta-callable-call-arity.test.ts` — `:420`
    (`LoadOutcome.registered` docstring). 0183 §Fix item 2 corrected `:39`,
    which now reads "the production compose helper". Load call: `:449`.
  - `tests/tools-derived-name-shape.test.ts` — `:299`
    (`LoadOutcome.registered` docstring). 0183 corrected `:110–111`. Load
    call: `:328`.
  - `tests/tools-entry-containment.test.ts` — `:190`
    (`LoadOutcome.registered` docstring). 0183 corrected `:49`. Load call:
    `:227`.
  - `tests/tools-entry-closed-grammar.test.ts` — `:286`
    (`LoadOutcome.registered` docstring). 0183 corrected `:95–96`. Load call:
    `:315`.
  - **The ground truth.** `src/extension/production-composition.ts:366`
    (`export async function discoverAndComposeFixtures`), `:433`
    (`runComposePass`, the pass both functions share), `:1214`
    (`export async function composeExtensionInstance`);
    `extensions/index.ts:13` (`export { default } from
    "../src/extension/factory";`, the file's only export);
    `src/extension/factory.ts:1104` (`export default function thetaExtension`),
    `:1146` (the `composeInstance` callback passing
    `composeExtensionInstance(pi, ctx, undefined, rendererGate,
    ownRegisteredNames)`), `:591` (`pi.registerCommand`, the only registration
    call in the tree).
  - **The correct wording already in the tree**, for the fix to copy:
    `tests/conformance/production-conformance.test.ts:47–52` (0183's shipped
    rewrite), `tests/theta-callable-call-arity.test.ts:39`,
    `tests/subagent-executable-refusal-e2e.test.ts:1–2`,
    `tests/subagent-root-registration-refusal-envelope.test.ts:31`,
    `src/extension/production-composition.ts:357–365` (the helper's docstring).
- **Observed at:** v0.129.0 (`5a92a36c`, `package.json:3`). Offline,
  deterministic, provider-free: `rg` and file reads only. No test was run and no
  probe was written to establish the finding — it is settled by the absence of a
  caller, which one `rg` decides.
- **Related:**
  - [0183](./0183-production-conformance-comment-misnames-composition-root.md)
    — **fixed (0.129.0)**. Same defect, same substitution, disjoint sites:
    0183 enumerated ten sites in nine files (§Actual behaviour, items 1–10)
    plus three false call chains in
    `tests/live/live-production-acceptance.test.ts`, and all thirteen are
    corrected at HEAD. None of this report's twenty-four sites is among them.
    0183 §Non-goals scoped its inventory to sites that "identify the helper
    *as* the shipped root" and excluded loose `composition root` mentions that
    name no symbol; the sites here meet the first test, not the second — each
    attributes a helper drive to the shipped root, ten of them inside the same
    file as a site 0183 corrected. One site (`:73` of 0183's own subject file)
    is 0183 §Fix item 1's fourth downstream repetition, left uncorrected while
    the other three were fixed. These three sites were named at 0183's merge
    review (`tests/ctor-unresolved-schema-name.test.ts`,
    `tests/typeenv-prototype-names.test.ts`,
    `tests/invoke-arg-type-mismatch-wired.test.ts`); 0183's `## Fix (0.129.0)`
    §*Residuals* items 1–5 do not record them, so the merge review is the
    provenance of record. The remaining twenty-one are this report's sweep.
    The two reports share no site and can land in either order; 0183 is closed,
    so nothing blocks this one and it blocks nothing.
  - [0112](./0112-containment-records-inv5-label-and-coverage-row.md) —
    **open**, the class: shipped records that disagree with the tree while
    behaviour is correct, mechanical comment-token edits, same S4/D1 shape.
    This report adds no finding to 0112. 0112 edits `src/extension/**` comments
    and `docs/plan_topics/coverage-matrix.md`; this one edits `tests/**`
    comments, including `tests/tools-entry-containment.test.ts`, which is
    0110/0112's witness — comment bytes only, on the same precedent 0183 used.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, and a
    distinct class this report must not be collapsed into. 0134's defect is
    *positional*: a `path:line` whose file, function and predicate are right
    and whose number moved under an insertion. These are FALSE claims, not
    stale lines. Every site here names the wrong function; re-deriving line
    numbers changes nothing, and a citation-refresh sweep of the 0134 kind
    would leave all twenty-four exactly as wrong as they are.

## Summary

Bug 0183 established that `discoverAndComposeFixtures` is not the shipped
`session_start` composition root: it has no caller in `src/**` or
`extensions/**`, and the shipped path is `extensions/index.ts:13` →
`src/extension/factory.ts`'s default export → `composeExtensionInstance`. It
corrected ten sites in nine files plus three call chains, and fixed the
vocabulary: *shipped composition root* = `composeExtensionInstance`,
*production compose helper* = `discoverAndComposeFixtures`.

Twenty-four further sites in fourteen `tests/**` files still carry the
corrected claim. Each sits in a file whose only load path is a
`discoverAndComposeFixtures` call, and each attributes that drive to the
shipped composition root: three by parenthetical identity ("the shipped
composition root (`discoverAndComposeFixtures`)"), two in
`describe` titles that reach reporter output, seven in the recurring
`LoadOutcome.registered` docstring "Slash names the shipped composition root
registered", the rest in header, banner and harness-docstring prose.

Ten of the twenty-four sit in files where 0183 corrected a neighbouring header
comment, so those files now name one function two ways. One sits in 0183's own
subject file as an uncorrected fourth repetition of the clause that fix
rewrote.

## Reproduction

Offline, at HEAD `5a92a36c`, v0.129.0. Every step is a read.

**The ground truth — who the shipped root is, and that the helper has no
caller.**

```sh
# One declaration and three comments in the file that declares it. No call.
rg -n 'discoverAndComposeFixtures' src/ extensions/
#   src/extension/production-composition.ts:366   declaration
#   src/extension/production-composition.ts:404, :470, :1014   comments

# What the shipped entry wires instead.
cat extensions/index.ts                        # 13 lines; :13 is the only export
rg -n 'composeExtensionInstance' src/extension/factory.ts       # :50 import, :1146 call
rg -n 'export async function composeExtensionInstance' src/extension/production-composition.ts   # :1214
rg -n 'export default function thetaExtension' src/extension/factory.ts                          # :1104
rg -n 'pi\.registerCommand\(' src/extension/factory.ts                                           # :591

# The pass the two functions share, which is what these suites actually cover.
rg -n 'async function runComposePass' src/extension/production-composition.ts   # :433

# The helper's callers: test files only.
rg -l 'discoverAndComposeFixtures' tests/ | wc -l               # 25
```

**The sites.** Current bytes, one `sed` per site.

```
tests/ctor-unresolved-schema-name.test.ts:79
//       is never constructed. Cell LOAD drives the shipped composition root.

tests/ctor-unresolved-schema-name.test.ts:506
// constructed. Drives the SHIPPED composition root over a temp discovery root.

tests/ctor-unresolved-schema-name.test.ts:510
describe("bug 0025 (5) load consequence — the shipped composition root refuses the theta", () => {

tests/typeenv-prototype-names.test.ts:135
// through one in-process drive of the shipped composition root over a

tests/typeenv-prototype-names.test.ts:642
// (d) L1 — the load consequence, through the SHIPPED composition root over a

tests/typeenv-prototype-names.test.ts:656
 * Drive the shipped composition root over a throwaway discovery root holding

tests/invoke-arg-type-mismatch-wired.test.ts:43–44
// `.pi/theta/` workspace through the shipped composition root
// (`discoverAndComposeFixtures`): which slash names registered, and which

tests/invoke-arg-type-mismatch-wired.test.ts:421
  /** Slash names the shipped composition root registered. */

tests/conformance/production-conformance.test.ts:73
// reachable through the shipped composition root / the production runtime host /

tests/production-tools-load-resolution.test.ts:23–24
// discovery path. `discoverAndComposeFixtures` (the shipped `session_start`
// composition root) parses each discovered `.theta` and composes it into a

tests/production-tools-load-resolution.test.ts:810
  /** Slash names the shipped composition root registered (returned fixtures). */

tests/tools-field-shape-refusal.test.ts:130
// Through the shipped composition root, one theta per planted workspace:

tests/tools-field-shape-refusal.test.ts:656–657
// (D3) / (D4) THE PRODUCTION LOAD PATH — the shipped `session_start`
// composition root over a real on-disk `.pi/theta/` discovery workspace, ONE

tests/tools-field-shape-refusal.test.ts:668
  /** Slash names the shipped composition root registered (returned fixtures). */

tests/e2e-s5-package-discovery-composition-root.test.ts:43
 * Drive the SHIPPED composition root over a real on-disk workspace with an

tests/empty-query-annotation.test.ts:1032
    // SHIPPED composition root, and require the theta to be dropped with its

tests/prompt-mode-extension-tool-reach-e2e.test.ts:77
 * The fake PARENT host: serves the shipped composition root's load pass (the

tests/prompt-mode-extension-tool-reach-e2e.test.ts:230
describe("bug 0001 e2e — prompt-mode code-side extension-tool reach through the shipped composition root", () => {

tests/subagent-fn-extension-tool-dispatch-e2e.test.ts:124
 * The fake PARENT host: serves the shipped composition root's load pass (the

tests/subagent-fn-extension-tool-dispatch-e2e.test.ts:239
// --- Parent leg: load + dispatch through the shipped composition root ---------

tests/theta-callable-call-arity.test.ts:420
  /** Slash names the shipped composition root registered (returned fixtures). */

tests/tools-derived-name-shape.test.ts:299
  /** Slash names the shipped composition root registered (returned fixtures). */

tests/tools-entry-containment.test.ts:190
  /** Slash names the shipped composition root registered (returned fixtures). */

tests/tools-entry-closed-grammar.test.ts:286
  /** Slash names the shipped composition root registered (returned fixtures). */
```

**That each site's file drives the helper and nothing else.**

```sh
rg -n 'await discoverAndComposeFixtures|= discoverAndComposeFixtures' \
  tests/ctor-unresolved-schema-name.test.ts \
  tests/typeenv-prototype-names.test.ts \
  tests/invoke-arg-type-mismatch-wired.test.ts \
  tests/conformance/production-conformance.test.ts \
  tests/production-tools-load-resolution.test.ts \
  tests/tools-field-shape-refusal.test.ts \
  tests/e2e-s5-package-discovery-composition-root.test.ts \
  tests/empty-query-annotation.test.ts \
  tests/prompt-mode-extension-tool-reach-e2e.test.ts \
  tests/subagent-fn-extension-tool-dispatch-e2e.test.ts \
  tests/theta-callable-call-arity.test.ts \
  tests/tools-derived-name-shape.test.ts \
  tests/tools-entry-containment.test.ts \
  tests/tools-entry-closed-grammar.test.ts
rg -n 'composeExtensionInstance' tests/ctor-unresolved-schema-name.test.ts \
  tests/typeenv-prototype-names.test.ts tests/invoke-arg-type-mismatch-wired.test.ts \
  tests/production-tools-load-resolution.test.ts tests/tools-field-shape-refusal.test.ts \
  tests/e2e-s5-package-discovery-composition-root.test.ts tests/empty-query-annotation.test.ts \
  tests/prompt-mode-extension-tool-reach-e2e.test.ts tests/theta-callable-call-arity.test.ts \
  tests/tools-derived-name-shape.test.ts tests/tools-entry-containment.test.ts \
  tests/tools-entry-closed-grammar.test.ts
```

The second command returns no hit: none of those twelve files imports or calls
the shipped root. Two of the fourteen mention it and neither weakens a site.
`tests/conformance/production-conformance.test.ts:51` names it inside 0183's
corrected header, and the file's own load call is the helper (`:262`).
`tests/subagent-fn-extension-tool-dispatch-e2e.test.ts` imports it (`:54`) and
calls it at `:511` — in the CHILD leg, which is not the surface `:124` and
`:239` describe: both name the PARENT leg, whose load call is
`discoverAndComposeFixtures` (`:251`).

**That 0183's own inventory is discharged and disjoint.**

```sh
# The ten enumerated sites and the three chain comments now read correctly.
sed -n '47,52p'   tests/conformance/production-conformance.test.ts
sed -n '192,193p' tests/conformance/production-conformance.test.ts
rg -n 'production compose helper' tests/ -g '*.ts'
# Two mentions remain (:2827, :2994); neither places the helper in the chain.
rg -n 'discoverAndComposeFixtures' tests/live/live-production-acceptance.test.ts
```

**The whole-corpus sweep this report's inventory comes from.**

```sh
rg -n -i 'composition root' tests/ src/ -g '*.ts' | wc -l         # 150 (tests 122, src 28)
rg -n -i 'composition root' tests/ src/ -g '*.ts' -A2 | rg 'discoverAndComposeFixtures'
```

Excluded after judging each pairing, and not part of the twenty-four:
`tests/e2e-s5-package-discovery-composition-root.test.ts:1`, `:5`, `:21`,
`:105`, `:106` and the file name itself (the merge point is at the composition
root — 0183 §Non-goals keeps the name);
`tests/tools-field-shape-refusal.test.ts:40` and
`tests/tool-arg-runtime-schema-validation.test.ts:89` (both name the helper
without calling it the root); `tests/live/tools-field-shape-refusal-live-cell.test.ts:14–15`
and `tests/live/live-production-acceptance.test.ts` throughout (they drive the
real root and name it correctly);
`tests/discovery-glob-universe-enumeration-failure.test.ts:1019`, `:1151` (the
real root, `composeExtensionInstance`); every `src/**` mention, each of which
describes the real root.

## Expected behaviour

- **A comment that names a production entry path names the path the product
  takes.** `docs/STYLE.md:26`: "Every claim is testable or is removed." "X is
  the shipped composition root" is decided by `rg X src/ extensions/`; for
  `X = discoverAndComposeFixtures` the answer at HEAD is no caller.
- **A `describe` title names the surface the cells drive.** Two titles report
  "the shipped composition root" for cells whose only load call is the helper.
- **A docstring on a load observable names the function that produced it.**
  `LoadOutcome.registered` is `fixtures.map((f) => f.slashName)` off the
  helper's return. The helper does not register: registration is
  `pi.registerCommand` at `factory.ts:591`, on the shipped path only.
- **One corpus uses one name for one thing.** After 0183 the tree defines both
  names. Ten of these sites sit in files whose header now uses the corrected
  vocabulary while a docstring or banner below it uses the false one.

## Actual behaviour / root cause

`rg -n 'discoverAndComposeFixtures' src/ extensions/` returns four hits, all in
`src/extension/production-composition.ts`: the declaration (`:366`) and three
comments (`:404`, `:470`, `:1014`). Under a real `pi` host the function never
runs. The shipped path is `extensions/index.ts:13` → `factory.ts:1104`
(`thetaExtension`) → the `composeInstance` callback at `:1146` →
`composeExtensionInstance` (`production-composition.ts:1214`), with
`pi.registerCommand` firing at `factory.ts:591`. The two functions meet only at
`runComposePass` (`:433`), which the helper runs once and
`composeExtensionInstance` runs per pass, so the seams these suites do not
reach are registration, the `theta-system-note` load routing, hot reload, the
PIC-69 own-registration ledger and the PIC-59 envelope writer — 0183 §Actual
behaviour measures the difference seam by seam.

Each of the twenty-four sites asserts the opposite. Three do it by explicit
apposition (`invoke-arg-type-mismatch-wired.test.ts:43–44`,
`production-tools-load-resolution.test.ts:23–24`, and
`ctor-unresolved-schema-name.test.ts:510`'s title paired with the `it` title at
`:511` that names the symbol). Seven are the same copied docstring line
("Slash names the shipped composition root registered"), which is false twice:
wrong function, and the helper performs no registration at all. The remaining
fourteen are header, banner and harness-docstring prose whose subject is
identified by the load call immediately below it.

**Root cause.** 0183's inventory was built from one filter — sites where the
phrase `composition root` and the token `discoverAndComposeFixtures` are close
enough to be caught by `rg -i 'composition root' -A2 | rg
discoverAndComposeFixtures`. That filter finds five lines at HEAD. It misses
every site where the false attribution and the call it refers to are more than
two lines apart, which is the common case: a header thirty lines above the
import, a `describe` title above the `it` that names the symbol, a docstring on
the interface the drive returns. The `LoadOutcome.registered` line is the
sharpest instance — copied verbatim into seven files, never within two lines of
a call. 0183 corrected the header of five of those seven files and left the
docstring in each, so the fix hardened the vocabulary at the top of the file and
left the same claim below it.

## Why it matters

- **Same ceiling as 0183, at fourteen more entry points.** A reader who accepts
  any of these sites concludes that the shipped `session_start` wiring —
  registration, the note channel, the ledger, the reload wiring, the envelope
  writer — is under a standing offline net. It is not; those seams are reached
  by other tests and by the live suite through the real entry.
- **The corrected files now disagree with themselves.** In ten of the fourteen,
  0183's shipped wording sits above the false wording in the same file. A reader
  who trusts the nearer text gets the wrong answer, and the next reader cannot
  tell which is current.
- **Two of the sites are reporter output.** `describe` titles are what a test
  run prints, so the false attribution appears in the suite's own output, not
  only in the source.
- **The wrongness is invisible to the suite.** No gate reads `tests/**`
  comments or titles; `npm test` is green with the claims in place and green
  when they are corrected. Only reading catches it, which is how 0183's ten and
  these twenty-four were both found.
- **0183 is recorded as discharged in full.** Its §Fix items 1–3 are marked
  shipped, including "the same file's four downstream repetitions", while the
  fourth (`:73`) still carries the clause. The record overstates the sweep it
  performed.

## Fix

Apply the same substitution 0183 §Fix item 2 prescribes, in the vocabulary
0183 §Fix item 4 fixes: *shipped composition root* = `composeExtensionInstance`
(via `extensions/index.ts` → `factory.ts`'s default export); *production
compose helper* = `discoverAndComposeFixtures`, test-only, one pass, no reload
wiring. At each of the twenty-four sites in §Affected, name the helper as the
production compose helper instead of the shipped composition root. No other
byte of any file changes: no assertion, no fixture, no import, no cell, no
gate.

The seven copies of the `LoadOutcome.registered` docstring take one wording:
the slash names the production compose helper returned. The helper registers
nothing, so the docstring must not attribute registration to it — the existing
`(returned fixtures)` parenthetical in six of the seven already says what the
field is, and `tests/invoke-arg-type-mismatch-wired.test.ts:421` lacks it and
gains it.

Two sites are titles and are the only executable-line hunks:
`tests/ctor-unresolved-schema-name.test.ts:510` and
`tests/prompt-mode-extension-tool-reach-e2e.test.ts:230`. Renaming a `describe`
moves reporter output and nothing else, on the same authorization 0183 §Fix
item 1 used for `production-conformance.test.ts`'s title. The `it` titles at
`ctor-unresolved-schema-name.test.ts:511` and
`empty-query-annotation.test.ts:1028` already name the symbol correctly and are
not touched.

`tests/conformance/production-conformance.test.ts:73` completes 0183 §Fix
item 1: it is the fourth downstream repetition that fix names and did not edit.

Two files in the target set are witnesses other reports own —
`tests/tools-entry-containment.test.ts` (0110/0112's) and
`tests/theta-callable-call-arity.test.ts` (0071's). This report is the
authorization for a comment-only edit to their docstring prose, on the
precedent 0183 used for the same two files. No assertion, cell, fixture or
import in either file is in scope.

**Verification.**

- `rg -n 'discoverAndComposeFixtures' src/ extensions/` still returns only the
  declaration (`:366`) and its three comments (`:404`, `:470`, `:1014`).
- `rg -n -i 'shipped composition root' tests/ -g '*.ts'` and the same search
  for the `session_start` spelling return only sites whose subject is
  `composeExtensionInstance`.
- `rg -n 'Slash names the shipped composition root' tests/ -g '*.ts'` returns
  nothing.
- The diff is comment bytes plus two `describe` string literals:
  `git diff -- tests/ | grep -E '^[+-]' | grep -vE '^[+-]{3}' | grep -vE '^[+-]\s*(//|\*|/\*\*)'`
  returns only the two title lines.
- `npm test` green with the baseline test count unchanged; `tsc -p
  tsconfig.json --noEmit` clean; `npm run lint` clean.

No red/green flip is possible: no gate reads `tests/**` comment prose, so the
suite is green before and after. Phase 1 is verify-and-record, not a test. No
live run is owed — the corrected surface is prose and two reporter strings.

## Non-goals

- **Renaming, moving or deleting `discoverAndComposeFixtures`.** It is the
  offline production-load entry 25 test files import; consolidating it with
  `composeExtensionInstance` is a source change with test consequences.
- **The loose `composition root` mentions that name no symbol and attribute no
  drive**, listed under §Reproduction's exclusions. 0183 §Non-goals already
  dispositions them; loose usage is not a false claim.
- **Renaming `tests/e2e-s5-package-discovery-composition-root.test.ts`.** The
  name is about the merge point, not the entry — 0183 §Fix item 2's disposition
  stands.
- **The coverage gap itself.** That these suites do not reach the factory, the
  registration step or the reload wiring is a fact about them, not a defect
  this report asserts. Whether a witness is owed for those seams through the
  real entry is a separate question; the live suite drives them
  (`tests/live/live-production-acceptance.test.ts:12–14`).
- **Line-number drift in the neighbouring comments.** Several of these files
  carry `production-composition.ts:NNN` citations that moved under later
  growth — for example
  `tests/e2e-s5-package-discovery-composition-root.test.ts:6–7`'s
  `production-composition.ts:319-334` for a function at `:366`. That is
  [0134](./0134-params-shift-induced-stale-citations.md)'s class and is not
  swept here; a fix touching such a sentence may correct the number in passing.
- **`docs/bugs/**` prose about the helper.** Bug documents are records of their
  own HEAD. Nothing is rewritten there, 0183 included: its §Fix's "four
  downstream repetitions" claim is quoted in §Why it matters as evidence, not
  edited.

## Provenance

- Filing origin: the merge review of
  [0183](./0183-production-conformance-comment-misnames-composition-root.md)
  (fixed 0.129.0), which named three sites outside that report's inventory —
  `tests/ctor-unresolved-schema-name.test.ts`,
  `tests/typeenv-prototype-names.test.ts`,
  `tests/invoke-arg-type-mismatch-wired.test.ts`. 0183's `## Fix (0.129.0)`
  §*Residuals* records five items, none of them these three, so the review is
  the provenance of record. What this report adds: the three sites verified at
  HEAD with their current bytes; twenty-one further sites found by sweeping
  every file that imports the helper rather than by the two-line proximity
  filter 0183 used; the seven-file `LoadOutcome.registered` docstring family;
  the two `describe` titles; and `production-conformance.test.ts:73`, 0183 §Fix
  item 1's uncorrected fourth repetition in its own subject file.
- Tree measured: HEAD `5a92a36c`, v0.129.0 (`package.json:3`).
- Implementation read: `extensions/index.ts` (13 lines, `:13`);
  `src/extension/factory.ts` (`:50`, `:591`, `:1098`, `:1104`, `:1146`);
  `src/extension/production-composition.ts` (`:357–365`, `:366`, `:404`,
  `:433`, `:470`, `:1014`, `:1214`).
- Tests read (not modified): the fourteen files in §Affected at the cited
  lines, plus their load calls (`ctor-unresolved-schema-name.test.ts:548`,
  `typeenv-prototype-names.test.ts:693`,
  `invoke-arg-type-mismatch-wired.test.ts:469`,
  `conformance/production-conformance.test.ts:262`,
  `production-tools-load-resolution.test.ts:839`,
  `tools-field-shape-refusal.test.ts:726`,
  `e2e-s5-package-discovery-composition-root.test.ts:60`,
  `empty-query-annotation.test.ts:1074`,
  `prompt-mode-extension-tool-reach-e2e.test.ts:222`,
  `subagent-fn-extension-tool-dispatch-e2e.test.ts:251`,
  `theta-callable-call-arity.test.ts:449`,
  `tools-derived-name-shape.test.ts:328`,
  `tools-entry-containment.test.ts:227`,
  `tools-entry-closed-grammar.test.ts:315`); the excluded sites listed under
  §Reproduction; and the three correctly-worded sites offered to the fix.
- History read: `git show 5a92a36c -- tests/conformance/production-conformance.test.ts`
  (0183's three corrected in-file repetitions, and the +6-line header growth
  that moved the uncorrected fourth from `:67` to `:73`).
- Style authority: `docs/STYLE.md:26` §Claims.
- Bug corpus read:
  `docs/bugs/0183-production-conformance-comment-misnames-composition-root.md`
  (§Affected, §Actual behaviour items 1–10, §Fix items 1–5, §Non-goals,
  §Residuals), `docs/bugs/0112-containment-records-inv5-label-and-coverage-row.md`
  (the class), `docs/bugs/0134-params-shift-induced-stale-citations.md` (the
  boundary).
- No probe was written, no file outside this document was touched, and no test
  was run to establish the finding.
