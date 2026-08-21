# Bug 0215 — Two comment sites bug 0207's twenty-four-site sweep did not reach still attribute a `discoverAndComposeFixtures` load to the shipped composition root: `tests/tools-field-shape-refusal.test.ts:157–159` claims its "composition-root half" proves the refusal "reaches the shipped `session_start` registration verdict" — in a file whose other three sites 0207 corrected, so the file now contradicts itself — and `tests/prompt-mode-extension-tool-reach-e2e.test.ts:16–18` claims the dispatch is "wired by the composition root" and that "the whole load→register→dispatch chain is the shipped one", while at HEAD `rg -n 'discoverAndComposeFixtures' src/ extensions/` returns one declaration and three comments and no caller, and `pi.registerCommand` fires only from `src/extension/factory.ts:591`

- **Status:** fixed (0.147.0). §Fix is settled by precedent: the substitution is bug 0183
  §Fix item 4's vocabulary pair, applied by the mechanism 0207 shipped in
  0.137.0. No disposition is left to the run. No ordering dependency: 0207 and
  0183 both shipped.
- **Sev/Diff estimate:** S4/D1 — comment prose that misdescribes a surface whose
  behaviour is correct; the ceiling is a reader who believes two offline files
  enter the shipped `session_start` registration path they never reach. D1
  because both hunks are comment tokens in two files, the replacement wording is
  fixed by 0183 §Fix item 4 and already present in both files' own headers, and
  no executable line moves.
- **Kind:** documentation defect in test-file comments. No spec sentence is
  violated and no `theta/*` code, REQ-ID, registry row or plan leaf is engaged.
  The applicable in-tree rule is `docs/STYLE.md:26` §Claims — "Every claim is
  testable or is removed" — and each claim below is testable by one `rg` and
  false.
- **Affected** (every citation verified at HEAD `689fc630`, v0.137.0, by `rg`
  and by reading each file):
  - `tests/tools-field-shape-refusal.test.ts:157–159` — the TIER block's second
    half. Verbatim: `// composition-root half is what makes the witness a
    production-load witness — / // it proves the frontmatter-layer refusal
    reaches the shipped \`session_start\` / // registration verdict over a real
    on-disk \`.pi/theta/\` discovery walk.` The file's only load call is
    `discoverAndComposeFixtures` at `:726`. 0207 corrected this file's other
    three sites: `:130` now reads "Through the production compose helper", `:656`
    "the production compose helper over", `:668` "the production compose helper
    returned". The file therefore names the same call two ways.
  - `tests/prompt-mode-extension-tool-reach-e2e.test.ts:16–18` — the fake
    parent-host paragraph's closing clause. Verbatim: `// \`agent_settled\` — but
    here it backs the COMPOSITION-BUILT dispatch (the real / //
    \`createProductionHostLoopDispatch\` wired by the composition root), not an
    / // injected seam, so the whole load→register→dispatch chain is the shipped
    one.` The file's only load call is `discoverAndComposeFixtures` at `:222`.
    0183 §Fix item 2 corrected this file's `:2` ("the production compose helper
    (`discoverAndComposeFixtures`)") and 0207 corrected `:77` and the `describe`
    title at `:230`; `:16–18` is the residue.
  - **The ground truth**, re-derived at HEAD:
    `src/extension/production-composition.ts:366` (`export async function
    discoverAndComposeFixtures`), whose own docstring at `:357–365` states "The
    shipped `session_start` path composes through `composeExtensionInstance`
    below instead… this helper is driven directly by tests that want a single
    discover-and-compose pass with no reload wiring"; `:433` (`runComposePass`,
    the pass both entries share); `:649` (`createProductionHostLoopDispatch`,
    wired inside `runComposePass`, so it is the production dispatch on both
    paths); `:1219` (`export async function composeExtensionInstance`);
    `extensions/index.ts:13` (`export { default } from
    "../src/extension/factory";`, the file's only export);
    `src/extension/factory.ts:1104` (`export default function thetaExtension`),
    `:1146` (the `composeInstance` callback passing `composeExtensionInstance(pi,
    ctx, undefined, rendererGate, ownRegisteredNames)`), `:591`
    (`pi.registerCommand`, the only registration call in the tree). `rg -n
    'registerCommand' src/extension/production-composition.ts` returns six
    comment lines and no call, so neither cited test reaches registration.
  - **The correct wording already in the tree**, for the fix to copy:
    `tests/tools-field-shape-refusal.test.ts:130`, `:656`, `:668` (0207's own
    edits in the subject file); `tests/prompt-mode-extension-tool-reach-e2e.test.ts:2`,
    `:77`, `:230`; `tests/conformance/production-conformance.test.ts:50` (0183's
    rewrite, which additionally names `runComposePass` as the shared pass);
    `src/extension/production-composition.ts:357–365`.
- **Related:**
  - [0207](./0207-load-witness-comments-misname-composition-root.md) — fixed
    (0.137.0), the filing origin. Its sweep covered twenty-four sites in
    fourteen files, including three sites in
    `tests/tools-field-shape-refusal.test.ts` and two in
    `tests/prompt-mode-extension-tool-reach-e2e.test.ts`; its §Affected
    enumeration did not list the two sites in this report, so they were outside
    the sweep set rather than deferred. Its mechanism (comment tokens only, one
    substitution, no executable change) is what this report applies.
  - [0183](./0183-production-conformance-comment-misnames-composition-root.md) —
    fixed (0.129.0), which published the vocabulary: *shipped composition root* =
    `composeExtensionInstance` (via `extensions/index.ts` → `factory.ts`'s
    default export); *production compose helper* = `discoverAndComposeFixtures`,
    test-only, one pass, no reload wiring (§Fix item 4). Its §Non-goals also fix
    this report's boundary: "The `composition root` mentions in `tests/**` that
    name no symbol… Loose usage is not a false claim."
- **Observed at:** v0.137.0 (`689fc630`, `package.json:3`). Offline,
  deterministic, provider-free: `rg` and file reads only. No test was run and no
  probe was written — the finding is settled by the absence of a caller and of a
  registration call, which `rg` decides.

## Summary

0183 (0.129.0) fixed ten sites and published one vocabulary pair. 0207 (0.137.0)
applied it to twenty-four more in fourteen files. Two same-class sites remain.

`tests/tools-field-shape-refusal.test.ts:157–159` calls the file's second half
"the composition-root half" and says it "proves the frontmatter-layer refusal
reaches the shipped `session_start` registration verdict". Both halves are
false. The load call is `discoverAndComposeFixtures` (`:726`), not the
`session_start` path, and no registration verdict is reached at all: the helper
runs `runComposePass` and returns `ThetaFixture`s, while `pi.registerCommand`
exists only at `src/extension/factory.ts:591`, which the helper never enters.
0207 corrected this file's other three sites, so the file now describes one call
site as "the production compose helper" at `:130`, `:656` and `:668` and as the
shipped `session_start` path at `:158`.

`tests/prompt-mode-extension-tool-reach-e2e.test.ts:16–18` attributes the
production dispatch seam to "the composition root" and concludes "the whole
load→register→dispatch chain is the shipped one". The dispatch itself is the
production one — `createProductionHostLoopDispatch` is wired at
`production-composition.ts:649`, inside `runComposePass` (`:433`), the pass both
entries share — but the actor in this file is the helper, and the `register` hop
in the named chain is not reached. The file's own header at `:2` already names
the helper correctly, and 0207 corrected `:77` and the `describe` title at
`:230`.

Both sites are the class 0183 defined: a comment that identifies
`discoverAndComposeFixtures` *as* the shipped root, rather than loose use of the
phrase. Loose use remains out of scope by 0183 §Non-goals — the 13 sites in
`tests/**` matching `rg -n "content-addressing the shipped composition root"
tests/` name a property of the shipped path, not the actor of their own load.

## Reproduction

Offline, at `689fc630`. Verbatim output (paths as `rg` prints them on Windows):

```
$ rg -n -i "composition root|composition-root" tests/tools-field-shape-refusal.test.ts tests/prompt-mode-extension-tool-reach-e2e.test.ts
tests/prompt-mode-extension-tool-reach-e2e.test.ts:17:// `createProductionHostLoopDispatch` wired by the composition root), not an
tests/tools-field-shape-refusal.test.ts:157:// composition-root half is what makes the witness a production-load witness —

$ rg -n "discoverAndComposeFixtures" src/ extensions/
src/extension\production-composition.ts:366:export async function discoverAndComposeFixtures(
src/extension\production-composition.ts:404: * Factored out of `discoverAndComposeFixtures` so `composeExtensionInstance`
src/extension\production-composition.ts:470:  // the same gate; the reload-less `discoverAndComposeFixtures` helper holds no
src/extension\production-composition.ts:1019:    // discoverAndComposeFixtures) — both flow through this pass.
```

The first site, `tests/tools-field-shape-refusal.test.ts:155–160`, verbatim:

```
// identical string and a shared-workspace load cannot attribute it. The
// composition-root half is what makes the witness a production-load witness —
// it proves the frontmatter-layer refusal reaches the shipped `session_start`
// registration verdict over a real on-disk `.pi/theta/` discovery walk. No
// integration or live tier is reachable for this observable: registration and
```

The second, `tests/prompt-mode-extension-tool-reach-e2e.test.ts:15–19`,
verbatim:

```
// tool executor, appends the toolResult transcript entry, and fires
// `agent_settled` — but here it backs the COMPOSITION-BUILT dispatch (the real
// `createProductionHostLoopDispatch` wired by the composition root), not an
// injected seam, so the whole load→register→dispatch chain is the shipped one.
// This wrapper contributes only the PARENT leg's load-pass surfaces (the
```

The load calls each site describes:

```
$ rg -n "discoverAndComposeFixtures\(" tests/tools-field-shape-refusal.test.ts tests/prompt-mode-extension-tool-reach-e2e.test.ts
tests/tools-field-shape-refusal.test.ts:726:  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
tests/prompt-mode-extension-tool-reach-e2e.test.ts:222:  fixtures = await discoverAndComposeFixtures(host.pi, host.ctx);
```

The registration call the first site claims to reach exists once in the tree,
`src/extension/factory.ts:591`, and `rg -n "registerCommand"
src/extension/production-composition.ts` returns comment lines only (`:11`,
`:412`, `:413`, `:1016`, `:1168`, `:1202`, `:1388`) — no call.

## Expected behaviour

A test-file comment names the surface the file drives. Per 0183 §Fix item 4, a
comment describing a `discoverAndComposeFixtures` load calls it the production
compose helper — test-only, one pass, no reload wiring — and reserves "the
shipped composition root" for `composeExtensionInstance`, reached through
`extensions/index.ts:13` → `src/extension/factory.ts:1146`. Where a comment
asserts what the load proves, the assertion covers what the helper path carries
and excludes what it does not, registration included.

## Actual behaviour / root cause

Both sites survive from before 0183. 0183 fixed ten enumerated sites; 0207
enumerated and fixed twenty-four more, including three others in
`tests/tools-field-shape-refusal.test.ts` and two others in
`tests/prompt-mode-extension-tool-reach-e2e.test.ts`. Neither report's §Affected
lists these two, and no gate reads comment prose, so the sweep's completeness
rested on the enumeration alone. The two sites use different surface wording
("composition-root half", "wired by the composition root") from the phrase both
sweeps keyed on ("the shipped composition root", "the shipped `session_start`
composition root"), so an enumeration built by matching that phrase misses them
while a reader gets the same false attribution.

The consequences are confined to the record, and one of them is a
self-contradiction: `tests/tools-field-shape-refusal.test.ts` describes its one
load call as the production compose helper at three sites and as the shipped
`session_start` registration path at a fourth. Its `:158` claim is additionally
false on registration reach in a way the corrected sites are not — the helper
returns fixtures and registers nothing.

## Why it matters

- **A false claim about coverage is the class of claim readers act on.** Both
  sites tell a reader the file exercises the shipped `session_start` path. A
  contributor deciding whether registration behaviour is already witnessed reads
  a yes, and the shipped `pi.registerCommand` call is entered by no offline test
  in either file.
- **One file contradicts itself.** Three corrected sites and one uncorrected
  site in `tests/tools-field-shape-refusal.test.ts` name the same call
  differently, which costs the next reader a re-derivation to find out which is
  true.
- **The vocabulary is only worth having if it is complete.** 0183 published the
  pair so the corpus converges on one name per surface; two residual sites keep
  both names in circulation for the same function.
- **`docs/STYLE.md:26` §Claims.** Every claim is testable or removed. Both
  claims are testable by one `rg` and false.

## Fix

**Apply 0183 §Fix item 4's vocabulary at both sites, comment bytes only.** No
executable line, assertion, fixture, import, title or gate changes.

1. `tests/tools-field-shape-refusal.test.ts:157–159` — name the second half the
   production-compose-helper half and state what it proves: that the
   frontmatter-layer refusal reaches the production load verdict —
   `discoverAndComposeFixtures`'s returned fixture set — over a real on-disk
   `.pi/theta/` discovery walk, through the same `runComposePass`
   (`src/extension/production-composition.ts:433`) the shipped `session_start`
   root (`composeExtensionInstance`, `:1219`, wired `extensions/index.ts:13` →
   `src/extension/factory.ts:1146`) re-runs per pass. Drop the registration
   claim: the helper path does not reach `pi.registerCommand`
   (`factory.ts:591`). Keep the rest of the block, including the following
   sentence at `:159–161` about no integration or live tier being reachable,
   which is true as written. Match the wording already at this file's `:130`,
   `:656` and `:668`.
2. `tests/prompt-mode-extension-tool-reach-e2e.test.ts:16–18` — attribute the
   dispatch to `runComposePass`, which is where `createProductionHostLoopDispatch`
   is wired (`production-composition.ts:649`) and which both the helper and the
   shipped root run, and narrow the chain claim from
   "load→register→dispatch … the shipped one" to the two hops the file drives:
   load and dispatch are the production ones; registration is not reached.
   Match the wording already at this file's `:2`, `:77` and `:230`.

Constraints:

- **Comment-only, provable.** After the edit, `git diff -- <file> | grep -E
  '^[+-]' | grep -vE '^[+-]{3}' | grep -vE '^[+-]\s*//'` returns nothing (exit
  1) for both files, and each file's comment-stripped form is byte-identical to
  `git show HEAD:<file>`'s.
- **No new vocabulary.** Both replacements use 0183 §Fix item 4's pair verbatim
  and cite symbols, not roles.
- **Scope is the two sites.** The 13 `tests/**` comments matching `rg -n
  "content-addressing the shipped composition root" tests/` name a property of
  the shipped path rather than the actor of their own load, and stay untouched
  per 0183 §Non-goals.
- **No red/green flip is possible.** No gate reads `tests/**` comment prose, so
  the default suite is green with the claim in place and green when it is
  corrected. Verification is the two `rg` re-derivations above plus an unchanged
  suite count; no test is added.

## Provenance

- Origin: the bug 0207 fix (0.137.0). Its sweep set was the twenty-four sites its
  §Affected enumerates; these two are same-class sites outside that enumeration,
  measured after it landed. This report adds the verbatim text of both sites at
  HEAD, the self-inconsistency the 0207 edits created in
  `tests/tools-field-shape-refusal.test.ts`, the registration-reach half of the
  first site's falsehood (`pi.registerCommand` at `factory.ts:591`, absent from
  `production-composition.ts`), and the wiring fact that makes the second site's
  dispatch claim half-true (`createProductionHostLoopDispatch` at
  `production-composition.ts:649`, inside the shared `runComposePass`).
- Precedent: bug 0183 §Fix item 4 (the vocabulary pair) and §Non-goals (loose
  usage excluded); bug 0207 (the mechanism — comment tokens only, one
  substitution per site, comment-stripped byte-identity as the proof).
- Implementation evidence at `689fc630`:
  `src/extension/production-composition.ts:357–365` (the helper docstring, which
  states the split), `:366` (`discoverAndComposeFixtures`), `:433`
  (`runComposePass`), `:649` (`createProductionHostLoopDispatch`), `:1219`
  (`composeExtensionInstance`); `extensions/index.ts:13`;
  `src/extension/factory.ts:591` (`pi.registerCommand`), `:1104` (the default
  export), `:1146` (the `composeExtensionInstance` call).
- Test evidence at `689fc630`: `tests/tools-field-shape-refusal.test.ts:130`,
  `:157–159`, `:656`, `:668`, `:726`;
  `tests/prompt-mode-extension-tool-reach-e2e.test.ts:2`, `:16–18`, `:77`,
  `:222`, `:230`; `tests/conformance/production-conformance.test.ts:50`.
- Reproduction: four `rg` invocations and two file reads, quoted verbatim in
  §Reproduction. No test was run, no probe written, no file created.

## Fix (0.147.0)

- **What shipped** — §Fix's two sites, comment bytes only, in bug 0183 §Fix
  item 4's vocabulary (*production compose helper* =
  `discoverAndComposeFixtures`; *shipped composition root* =
  `composeExtensionInstance`), by bug 0207's mechanism:
  - `tests/tools-field-shape-refusal.test.ts:157–159` (§Fix item 1) — the TIER
    block's second half is now "the production compose helper half", and what it
    proves is the production load verdict — `discoverAndComposeFixtures`'s
    fixtures — "over a real on-disk `.pi/theta/` walk, through the
    `runComposePass` the shipped `session_start` root re-runs". The registration
    claim is **dropped**: the helper path never reaches `pi.registerCommand`
    (`src/extension/factory.ts:591`). The following sentence (no integration or
    live tier reachable) is retained, word for word. The file no longer names one
    call two ways — `:130`, `:656`, `:668` (0207's edits) and this site now agree.
  - `tests/prompt-mode-extension-tool-reach-e2e.test.ts:15–18` (§Fix item 2) —
    the dispatch is attributed to `runComposePass` ("the real
    `createProductionHostLoopDispatch`, wired inside the `runComposePass` the
    shipped root shares"), the `COMPOSITION-BUILT` shout and the "not an injected
    seam" contrast are retained, and the chain claim is narrowed from "the whole
    load→register→dispatch chain is the shipped one" to "load and dispatch are
    production; registration is not reached". Agrees with this file's `:2`,
    `:77` and `:230`.

  Diffstat: `2 files changed, 15 insertions(+), 15 deletions(-)` — every changed
  line is `//`-prefixed. **No executable hunk was authorized or taken**: unlike
  0207, this report authorizes no `describe` rename, and none was made.
- **Evidence re-verified at the fix HEAD** (`fdcb0835`, v0.144.0), not at the
  filing HEAD (`689fc630`): both target sites were byte-exact with **zero line
  drift**, so §Affected needed no relocation. Four *ground-truth* citations in
  §Affected/§Provenance had drifted by +1 and are recorded here rather than
  edited above (0207 §Non-goals keeps bug documents as records of their own
  HEAD): `discoverAndComposeFixtures` is `production-composition.ts:367`
  (§Affected says `:366`), `runComposePass` `:434` (says `:433`),
  `createProductionHostLoopDispatch` `:650` (says `:649`),
  `composeExtensionInstance` `:1220` (says `:1219`). Unchanged and re-confirmed:
  `factory.ts:591`, `:1146`; `extensions/index.ts:13`; the two load calls
  (`tools-field-shape-refusal.test.ts:726`,
  `prompt-mode-extension-tool-reach-e2e.test.ts:222`).
- **Gates** (verbatim):
  - Witness: **none exists and none was manufactured.** §Fix's premise — "no gate
    reads `tests/**` comment prose" — was re-established independently twice (in
    the tests-first phase and again at verification) rather than assumed. Exactly
    two functions read `tests/**/*.ts` bytes: `tools/closing-gate/live-corpus.js:151`
    (repo-scoped, consumed by `tests/warn-only-canary.test.ts` and
    `tests/live-corpus-release-gate.test.ts`) and `tools/closing-gate/index.js:920`
    (`loadCorpus`, pointed only at `test-fixtures/closing-gate/**` by its sole
    caller `tests/closing-gate.test.ts:26`). The former exposes those bytes
    through three token grammars only — the `theta/…` code grammar, the
    `[A-Z]{2,4}-<n>` REQ-ID grammar and `citesTokenInline`'s facet-token match —
    and **0 of the changed lines** carries a token any of them can see.
    `npm run lint` globs `src/**/*.ts` only; `tsc` reads the bytes but is blind
    to non-directive comment prose; nothing in `tests/` reads reporter output,
    and no `describe`/`it` title changed, so that channel is empty as well.
    No red is constructible, so none was faked.
  - Full suite: `npm test` → `Test Files 342 passed (342)`,
    `Tests 6560 passed (6560)` — identical to the lane-fork baseline.
  - Typecheck: `npx tsc -p tsconfig.json --noEmit` → exit 0.
  - Lint: `npm run lint` → exit 0 (scoped to `src/**/*.ts`; no cover for this
    prose, which was reviewed by reading).
  - No live run was owed or performed: the corrected surface is comment prose,
    no `tests/live/**` byte changed, and no executable line changed anywhere.
    Same disposition 0207 recorded for the identical class.
- **Comment-only proof, per file.** Method: a parser-based emit projection —
  `ts.transpileModule` with `removeComments` and `reportDiagnostics` over each
  worktree file and over its `git show HEAD:<path>` text, every transpile
  asserted diagnostic-free, the emitted text digested and compared. **Both files
  are emit-byte-identical to HEAD** (sha256/16 `47fe6592862e370d` for
  `tests/tools-field-shape-refusal.test.ts`, `14445b451638fb75` for
  `tests/prompt-mode-extension-tool-reach-e2e.test.ts`; the verifier's
  independent re-run under different compiler options produced different
  absolute digests, `97ba142e0a88fdd3` and `dcc712049b084a8f`, and the same
  worktree==HEAD equality, which is the invariant). §Fix's own filter over
  `git diff -- tests/`, dropping every `+`/`-` line whose payload starts with
  `//`, independently returns nothing (exit 1). Per-file `wc -l` is identical to
  HEAD — 943 and 273 — so no citing document's line numbers shift, and both
  files remain LF-only (CR count 0).
- **§Fix's verification greps, re-run after the edit:**

  ```
  $ rg -n 'discoverAndComposeFixtures' src/ extensions/
  src/extension/production-composition.ts:367:export async function discoverAndComposeFixtures(
  src/extension/production-composition.ts:405: * Factored out of `discoverAndComposeFixtures` so `composeExtensionInstance`
  src/extension/production-composition.ts:471:  // the same gate; the reload-less `discoverAndComposeFixtures` helper holds no
  src/extension/production-composition.ts:1020:    // discoverAndComposeFixtures) — both flow through this pass.
  ```
  One declaration and three comments; still **no caller**, so the premise of
  0183, 0207 and this report holds at this HEAD.

  ```
  $ rg -n -i "composition root|composition-root" tests/tools-field-shape-refusal.test.ts tests/prompt-mode-extension-tool-reach-e2e.test.ts
  (no output, exit 1)
  ```
  A clean 2→0 flip: neither file now contains the phrase in any casing.
- **Review**: 2 rounds. Round 1 (`bug-fix-reviewer`) — DEFECTS-FOUND, one
  `prose` finding: the first implementation's replacement lines ran 93/90/95 and
  95/86/80 characters against a 72–82 band, introducing the longest comment
  lines in either file; it also adjudicated the dropped `COMPOSITION-BUILT`
  shout as an unnecessary register loss (non-blocking residual). Two
  `bug-fix-fixer-light` passes followed: the first rewrapped to ≤82 but lost
  three §Fix-mandated elements (site 1's named fixture verdict and "real
  on-disk"; site 2's "the real" and "not an injected seam"), which the
  orchestrator caught by inspecting the diff; the second applied an
  orchestrator-computed wrap that restores all of them and still fits ≤82 with
  both line counts held. The orchestrator then restored one em dash the second
  pass had dropped after `agent_settled` (one comment character; no assertion,
  no executable line). Round 2 (`bug-fix-reviewer-fast`) — **CLEAN**, no
  findings, two non-blocking prose residuals (below); `recommend-deep-review`
  not raised.
- **Verification**: SOLID, no findings. Premise — re-derived independently from
  the two `tests/**` byte readers and their three grammars; verdict not
  witnessable, so no red was manufactured and no neutralization was attempted.
  Suite 342/6560; `tsc` exit 0; `lint` exit 0. Comment-only — parser projection
  regenerated from HEAD, worktree==HEAD per file; §Fix's filter empty. No drift
  — `wc -l` 943/273 equal to HEAD, CR 0. Fidelity — every clause of both new
  sentences located at a real symbol (`production-composition.ts:367`, `:434`,
  `:650` inside `runComposePass`, `:1220` whose docstring states the reload
  re-run; `factory.ts:591` as the tree's only `pi.registerCommand`, `:1146`;
  `extensions/index.ts:13`; both load calls), none false or overclaiming. Scope
  — zero executable lines, zero title changes, the 14 "content-addressing the
  shipped composition root" comments untouched, no third site edited. Live —
  none owed, none run.
- **Residuals**:
  - **"discovery" dropped from "discovery walk"** at
    `tests/tools-field-shape-refusal.test.ts:158`. §Fix item 1's phrasing is
    "over a real on-disk `.pi/theta/` discovery walk"; the shipped line reads
    "over a real on-disk `.pi/theta/` walk". The word was dropped to hold both
    the ≤82-character wrap and the file's line count: an exhaustive
    minimum-line word-wrap over the whole comment paragraph shows the fully
    verbatim sentence needs 11 lines where the paragraph's budget is 10, and
    growing the paragraph would shift ~780 lines of citations into this file
    (0134's class). No claim becomes false — the actor, the verdict and the
    shared pass are all still named, and `production-composition.ts:360` calls
    the same traversal a discovery walk. Review judged it non-blocking.
  - **Compressed shared-pass attribution** at
    `tests/prompt-mode-extension-tool-reach-e2e.test.ts:17–18`. §Fix item 2 asks
    for `runComposePass`, "which both the helper and the shipped root run"; the
    shipped wording is "wired inside the `runComposePass` the shipped root
    shares", which carries the sharing implicitly via *shares* rather than
    naming both parties, for the same line-budget reason. The paragraph's actor
    is the helper-driven load (named at this file's `:2` and `:77`), so the
    referent is recoverable. Review judged it adequate and non-blocking.
  - **Four drifted ground-truth citations inside this document**, recorded under
    *Evidence re-verified* above and deliberately not edited, per 0207
    §Non-goals: `:366`→`:367`, `:433`→`:434`, `:649`→`:650`, `:1219`→`:1220`.
    0134's class.
  - **No third same-class site was found.** The case-insensitive
    `composition root` / `composition-root` search over both files returns
    nothing, and the standing instruction was to record a third site rather than
    sweep it; none arose.
- **Discharge notes appended**: none. 0207 §Non-goals rules `docs/bugs/**` prose
  out of scope, so although this fix closes 0207's `## Fix (0.137.0)` residual 2
  (a) and (b), no note was added to 0207's document and its text stands as the
  provenance this report quotes.
- **Pinned dispositions / non-goals**: `discoverAndComposeFixtures` is not
  renamed, moved or consolidated; the 14 `tests/**` "content-addressing the
  shipped composition root" comments are left alone as true claims about the
  real root (0183 §Non-goals); the loose `composition root` mentions that name
  no symbol are left alone; no `describe`/`it` title was renamed; the coverage
  gap these two suites do not reach is not asserted as a defect; neighbouring
  0134-class line drift was not swept.
