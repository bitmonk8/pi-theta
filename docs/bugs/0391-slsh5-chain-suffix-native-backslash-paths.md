# Bug 0391 — The SLSH-5 chain-suffix placeholders render raw native `realpath` output, so on Windows the delivered err note interpolates `C:\…` backslash paths where SLSH-5 pins "the same `realpath`-normalised absolute paths used for discovery-root containment" — a form the corpus defines as `realpath` THEN forward-slash

- **Status:** fixed (0.394.0).
- **Sev/Diff estimate:** S4/D1 — impact class 4 (a spec-pinned diagnostic
  rendering in the wrong form; no value, registration, or containment outcome
  moves). The same physical file renders forward-slashed in every load
  diagnostic of the session (bug 0268's landed convention,
  `diagnostic-shape.md:32`) and backslashed in the SLSH-5 suffix of the same
  session's err note, so one grep spelling cannot find both — the exact
  operability regression 0268 was filed over, resurfacing on the one
  note-content surface its fix seams (diagnostic render + `details`
  normalisation) do not reach. D1: two mint sites route through the existing
  `canonicalizePath` instead of bare `fs.realpath`; one committed witness must
  drop a native-form compensation.
- **Kind:** defect — implementation diverges from the SLSH-5 placeholder-form
  pin (`docs/spec_topics/slash-invocation.md:54`), which delegates the form to
  invocation.md §Resolution's containment comparison, itself explicitly
  "compared byte-for-byte after forward-slash normalisation (per the 'Path
  literals' rule in Lexical Structure)" (`docs/spec_topics/invocation.md:12`).
  Plus one falsified code comment: `invoke-provenance.ts` claims the record is
  "the byte-exact post-`realpath` form V15a's discovery-root containment check
  uses", which is false on Windows.
- **Related:**
  - [0088](./0088-slsh5-chain-suffix-never-emitted.md) — fixed
    (0.205.0). Landed the provenance ledger this report is about, and its fix
    record touches the path form THREE times — a fixer must know the
    disposition was adjudicated once, and on what, before reopening it:
    (1) §Fix review round 1 adjudicated "the callee path form (adjudicated:
    bare `realpath` stays, matching the untouched
    `recordInvocationProvenance`; prose corrected)"; (2) §Residuals 3 records
    the same bare-`realpath`-vs-`canonicalizePath` code fact prose-only
    ("the ledger matches the implementation, so both placeholders of one
    rendered suffix are in one identical form"); (3) §Pinned dispositions /
    non-goals pins "The suffix text, hop ordering and path normalisation are
    unchanged (§Non-goals)". None of the three names the separator form, the
    spec pin at `invocation.md:12`, or any Windows observable — the ground
    adjudicated was internal consistency of the two placeholders with each
    other, not conformance of either to the containment form — so this input
    class is unrecorded, not pinned. Further, round 1's "prose corrected"
    claim is falsified at d63c5148: `invoke-provenance.ts:91–95` and
    `:102–110` still claim the recorded path is "the byte-exact
    post-`realpath` form V15a's discovery-root containment check uses".
    0088's witnesses assert with `node:path.join`-built (native-form)
    expectations, so they green on the divergent Windows form by
    construction.
  - [0268](./0268-load-notes-render-same-file-with-mixed-path-separators.md) —
    fixed (0.265.0). Landed the one-convention-per-pass separator rule for
    `Diagnostic.file` (render seam `renderDiagnosticLine`) and
    `details.diagnostics[].file` (`normaliseDetailsFileSpelling`,
    `system-note-channel.ts:66–81`). The SLSH-5 placeholders live in the note
    CONTENT string (interpolated by `err-note-render.ts`, delivered verbatim by
    `sendSystemNote`), a sibling surface neither seam touches — and unlike
    0268's field ("no spec rule pinning the field's spelling"), this surface
    HAS a spec pin.
  - [0382](./0382-slsh3-err-note-renders-raw-breaks-forged-second-note.md) —
    fixed (0.354.0). Same SLSH-3/SLSH-5 note surface, different defect (raw
    line breaks); no overlap in mechanism.
- **Affected:**
  - `src/runtime/invoke-provenance.ts:115` — `recordInvocationProvenance`
    stores `await deps.fs.realpath(input.parentPath)` raw; the doc comments at
    `:91–95` and `:102–110` claim byte-exact identity with the containment
    form.
  - `src/runtime/invoke-provenance-ledger.ts:115–122` — `attach` stores
    `await deps.fs.realpath(input.calleePath)` raw into `ChainHop.calleePath`.
  - `src/runtime/err-note-render.ts:206–213` — the suffix interpolates
    `h.calleePath` / `h.record.parentPath` verbatim.
  - `src/runtime/invocation.ts:142–147` — `canonicalizePath`
    (`normalizePath(await fs.realpath(path))`), the containment form SLSH-5
    references; `:108–119` the comparison that uses it.
  - `src/seams/pi-file-system.ts:30, :117–118` — production `realpath` is
    `fs.realpath.native`, which returns host-native separators (backslash on
    Windows).
  - `src/extension/production-theta-producer.ts:843, :866–874` — production
    wiring: the ledger is fed the `PiFileSystem` and `theta.sourcePath` /
    resolved callee path.
  - `tests/slsh5-invoke-cascade-chain-suffix.test.ts:101, :235, :270–271` —
    the committed witness builds its expected suffix from
    `join(thetaDir, …)` (native separators on Windows), so the gate matches
    the divergent form byte-for-byte and cannot red on it (the compensation
    class 0268 §Fix constraint 6 named).
- **Observed at:** v0.382.0 (`d63c5148`), Windows 11, NTFS. Offline scratch
  probe `tests/scratch-ci3-slsh5-pathform.test.ts` (deleted after the run)
  driving `recordInvocationProvenance`, `createInvocationProvenanceLedger`,
  and `renderTopLevelErrNote` from `src/` with the production `PiFileSystem`
  over a real temp directory.

## Summary

SLSH-5 (`slash-invocation.md:54`) pins the two chain-suffix placeholders to a
specific byte form: "`<callee_path>` and `<parent_path>` are the
post-`realpath` absolute paths recorded at the invocation site (per
[Invocation], 'Resolution' — the same `realpath`-normalised absolute paths
used for discovery-root containment…)". The containment comparison is defined
at `invocation.md:12` as decided on `realpath` output "compared byte-for-byte
after forward-slash normalisation (per the 'Path literals' rule in Lexical
Structure)", and the implementation mints that form through one named helper,
`canonicalizePath` (`invocation.ts:142–147`).

The provenance producer and the ledger skip the forward-slash half: both store
bare `fs.realpath(...)` output (`invoke-provenance.ts:115`,
`invoke-provenance-ledger.ts:115–118`). Production `realpath` is
`realpath.native` (`pi-file-system.ts:30`), which returns native backslash
paths on Windows. `renderTopLevelErrNote` interpolates the stored strings
verbatim (`err-note-render.ts:211`) and `sendSystemNote` delivers the content
string untouched (its 0268 normalisation applies only to
`details.diagnostics[].file`, `system-note-channel.ts:66–81`). Result: on
Windows every SLSH-5 chain suffix — and therefore every cascaded top-level
err note, SLSH-4-normative down to the byte — renders `C:\…` where the spec
form is `C:/…`. On POSIX the two forms coincide and nothing is observable.

## Reproduction

Scratch probe (offline, real filesystem; deleted after the run). Create
`parent.theta` / `child.theta` in a temp dir, then drive the three `src/`
units with the production `PiFileSystem`:

```ts
const canonicalParent = await canonicalizePath(fs, parentPath);   // containment form
const record = await recordInvocationProvenance({ fs }, { parentPath, callSite });
await ledger.attach(wrapper, { parentPath, calleePath: calleeAbs, callSite });
const note = renderTopLevelErrNote({ thetaName: "parent", error: wrapper, chain });
```

Observed (v0.382.0, Windows):

```
CANONICAL parent : "C:/Users/thomasa/AppData/Local/Temp/ci3-slsh5-PdxZPN/parent.theta"
RECORD parentPath: "C:\\Users\\thomasa\\AppData\\Local\\Temp\\ci3-slsh5-PdxZPN\\parent.theta"
CHAIN[0].calleePath: "C:\\Users\\thomasa\\AppData\\Local\\Temp\\ci3-slsh5-PdxZPN\\child.theta"
NOTE : "theta /parent returned Err: transport — boom from
        C:\\Users\\…\\child.theta invoked at C:\\Users\\…\\parent.theta:3"
record.parentPath === canonicalParent ? false
chain[0].calleePath === canonicalCallee ? false
```

The production path to the same observable is any cascaded `invoke(...)` `Err`
at the slash boundary: `#recordInvokeHop`
(`production-theta-producer.ts:866–874`) feeds `theta.sourcePath` and the
resolved callee into the ledger with the composition root's `PiFileSystem`,
and `emitTopLevelErrNote` renders the chain into the delivered
`theta-system-note`.

## Expected behaviour

- `slash-invocation.md:54` (SLSH-5): the placeholders are "the same
  `realpath`-normalised absolute paths used for discovery-root containment".
- `invocation.md:12` (§Resolution): the containment paths are `realpath`
  output "compared byte-for-byte after forward-slash normalisation (per the
  'Path literals' rule in Lexical Structure)".
- `invocation.ts:142–147`: the corpus's one minting helper for that form
  (`canonicalizePath`) — whose doc comment names itself "the one function that
  mints the canonical path identity … consumers reuse it rather than
  restating it".
- `slash-invocation.md:33` (SLSH-4): the note templates are normative and
  "Conformance tests MAY assert on the exact rendered string", so the
  placeholder byte form is contract, not presentation.

Expected note (the probe's cell): `… from C:/Users/…/child.theta invoked at
C:/Users/…/parent.theta:3`.

## Actual behaviour / root cause

`recordInvocationProvenance` (`invoke-provenance.ts:115`) and
`InvocationProvenanceLedger.attach` (`invoke-provenance-ledger.ts:115–118`)
call the raw `fs.realpath` seam and store its output without the
`normalizePath` forward-slash step — they restate half of `canonicalizePath`
instead of reusing it. Under the production `realpath.native` the stored form
is host-native (backslash on Windows); `err-note-render.ts:211` interpolates
it verbatim. The producer's own comment (`invoke-provenance.ts:106–110`,
"byte-exact post-`realpath` form V15a's discovery-root containment check
uses") asserts the identity the code does not establish — the same
falsified-comment shape bugs 0378 and 0268 each corrected at their seams.

The committed witness cannot red on this: `slsh5-invoke-cascade-chain-suffix.test.ts`
builds its expected suffix with `hopSuffix(join(thetaDir, …), …)` (`:101`,
`:270–271`), and `node:path.join` yields the same native separators the
implementation stores, so expectation and output agree on both regimes
while both disagree with the spec form on Windows.

## Why it matters

- The err note is the ONE user-visible attribution surface for cascaded
  failures (SLSH-3/SLSH-5), and its templates are exact-string normative
  (SLSH-4). A conformance assertion written from the spec (forward-slash
  containment form) fails against the shipped renderer on Windows.
- Post-0268 the corpus renders every located diagnostic's path
  forward-slashed on every host; the SLSH-5 suffix re-introduces the second
  spelling 0268 eliminated, so a session log is again not greppable by one
  path spelling for the same physical file.
- The divergence is load-bearing for any downstream consumer that correlates
  the note's `<parent_path>` with diagnostic `file` fields (byte comparison
  fails on Windows).

## Non-goals

- The theta-visible wrapper field `InvokeCalleeError.callee_path` — pinned as
  the literal path text as written (`err-note-render.ts` module comment;
  `queryerror-variants.md:198` pins no form), deliberately not `realpath`'d.
- The SNK-i `invoke_infra` row's `<callee_path>` (wrapper field, literal text)
  — a different placeholder with its own pin.
- `details.structural.added/removed` spelling
  (`runtime-event-channel.md:24` pins "absolute file paths" with no separator
  form) — unpinned, out of scope here.
- POSIX hosts — the two forms coincide; no observable.
- The WeakMap identity scheme, hop coverage, and envelope-crossing chain
  truncation — all as designed (bugs 0088/0347/0349 ground).

## Fix

Route both mint sites through the existing `canonicalizePath`
(`invocation.ts:142`) instead of bare `fs.realpath`:

- `invoke-provenance.ts:115` — `const parentPath = await canonicalizePath(deps.fs, input.parentPath);`
- `invoke-provenance-ledger.ts:115` — same for `calleePath` (keep the
  rejection-to-`undefined` arm).

This makes the stored `ChainHop` byte-identical to the containment form on
every host, which is what the module comments already claim and SLSH-5 already
pins — no spec edit needed (option: add a parenthetical "(forward-slash
normalised)" to SLSH-5 for redundancy). Alternative (rejected): normalise at
the render seam (`err-note-render.ts:211`) — one site, but leaves the stored
`ChainHop` divergent from its own doc comment and from any future consumer,
and 0268 already adjudicated that presentational-only fixes need a second
touch per consumer surface. Witness both directions: the committed
`slsh5-invoke-cascade-chain-suffix.test.ts` expectations must be built
forward-slashed (drop the `join`-native compensation, the move 0268 §Fix
constraint 6 prescribed for its own compensating tests), red before / green
after on Windows, byte-identical on POSIX.

## Fix (0.394.0)

- What shipped:
  - `src/runtime/invoke-provenance.ts` — `recordInvocationProvenance` mints the
    parent path through the shared `canonicalizePath` (`invocation.ts`) instead
    of bare `deps.fs.realpath`, so the recorded `parentPath` is the
    `realpath`-then-forward-slash containment form SLSH-5 pins
    (`slash-invocation.md:54` → `invocation.md:12`). Mechanism doc-comments
    corrected to name `canonicalizePath` (now true). No forked normaliser
    (0326 anti-fork law — the doc-named single minter is reused).
  - `src/runtime/invoke-provenance-ledger.ts` — `attach` mints
    `ChainHop.calleePath` through the same `canonicalizePath`; the
    rejection-to-`undefined` degrade arm is preserved byte-for-byte.
  - No spec edit (SLSH-5 already pins the form; the optional parenthetical was
    not added). `err-note-render.ts` untouched — the render-seam alternative
    the §Fix decision rejected was not taken.
- Tests (the compensating-test class, all built forward-slashed via a local
  `fwd = p => p.replace(/\/g, "/")` mirroring src `normalizePath`;
  byte-identical no-op on POSIX, form-correction only on Windows; no assertion
  weakened):
  - `tests/b0391-slsh5-chain-suffix-pathform.test.ts` — NEW offline witness;
    drives the real `src` units over a real `PiFileSystem` + temp dir. RED at
    fork for the path-form reason (`C:\u2026` vs `C:/…` on both mints and the
    rendered note); green after; the backslash-free CONTROL cannot red on POSIX.
  - `tests/slsh5-invoke-cascade-chain-suffix.test.ts` — the DOC-ENUMERATED
    witness (§Affected/§Fix); `join`-native compensation dropped.
  - `tests/b0294-callee-propagated-invoke-infra-wrapped.test.ts` — offline
    compensating cell (asserts the identical ledger-minted SLSH-5 rendered
    surface). Beyond the doc's file enumeration; **PARENT-RATIFIED** on the
    three-source evidence (0268-constraint-6 class member; identical rendered
    surface the fix canonicalizes, unlike stubbed b0295; byte-identical
    POSIX-no-op move, no assertion weakened — any spec-conformant fix reds it
    on Windows).
  - `tests/live/{slsh5-invoke-cascade-chain-suffix,b0294-callee-propagated-invoke-infra,err-note-render-record-error-field}-live-cell.test.ts`
    — the three live twins (dispatch live-obligation clause).
- Gates:
  - Witnesses green; full default suite 557 files / 10311 tests (baseline
    556/10307 + the new witness), the only reds being the LANE-BRIEF
    parallel-load-flake family (`Hook/Test timed out`, off-surface, green on
    isolated re-run). `npm run typecheck` clean; `npm run lint` clean.
  - Verification: revert-red / restore-green proved byte-exact on the parent
    mint (inverse Edit; `git diff` shows only the landed change); the callee
    mint's red direction witnessed at fork (all 5 b0391 cells red pre-fix).
- Live (run by the orchestrator under the lane LIVE LOCK; reviewer/verifier
  never run live): the three SLSH-5 live twins ran GREEN on the real
  `AgentSession` slash boundary (provider-free short-circuits), confirming the
  forward-slash form renders end-to-end on Windows.
- Review: 2 rounds. Round 1 (`bug-fix-reviewer`, deep) — F1 [test] blocker: a
  third compensating live cell (`err-note-render-record-error-field-live-cell`)
  was missed by the initial flip census; remedied with the same `fwd()` and
  re-run green live. Round 2 (`bug-fix-reviewer-fast`) — CLEAN; flipped set
  confirmed complete and exact.

## Provenance

canonical-identity-3 bug-hunt sweep, d63c5148 (v0.382.0). Probe:
`tests/scratch-ci3-slsh5-pathform.test.ts` (deleted after the run) — real
temp-dir files through the production `PiFileSystem`, outputs quoted in
§Reproduction verbatim.
