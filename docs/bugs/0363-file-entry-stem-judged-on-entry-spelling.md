# Bug 0363 — An explicit `.theta` file entry's slash name is derived from the entry's OWN spelling, not the on-disk filename, so on a case-insensitive host a `thetaPaths`/`--theta` entry `plan.theta` naming on-disk `Plan.theta` registers `/plan` with zero diagnostics where DISC-3 mandates `invalid-slash-name` refusal — and the registered theta's every subagent-mode invocation then refuses child-side, because the child's directory enumeration sees the real `Plan.theta` and never re-discovers the slug

- **Status:** fixed (0.355.0).
- **Sev/Diff estimate:** S2/D2 — S2: two silent divergences from one root
  cause. Direction (i) is silent permissive acceptance (a stem the spec
  rejects registers, under a name the file does not carry) whose downstream is
  a hard, wrong-cause runtime refusal: the parent-registered slug is absent
  from the child's own discovery, so every subagent-mode invocation of it dies
  in the marked-root registration refusal (`load_failure` envelope) while the
  prompt-mode leg works — a parent/child skew nothing names. Direction (ii)
  falsely refuses a valid on-disk file (`GOOD.theta` entry naming on-disk
  `good.theta` draws `invalid-slash-name` although the file's real stem is
  legal). Not S1: no wrong value is computed; the harms are a forbidden
  registration plus refusals. D2: the fix is confined to the explicit-file
  arms of the discovery walk (derive the stem from the on-disk directory
  entry — one `readdir` of the parent, matching the entry case-insensitively
  the way the filesystem resolved it, or `realpath`-canonicalise the candidate
  path before stem derivation), plus a spec sentence choosing the on-disk name
  as the stem source.
- **Kind:** defect against DISC-3's letter on both directions, with a spec gap
  underneath: `discovery-sources.md:76` defines the slash name as "the theta's
  **filename** stem taken verbatim" — the filename is the directory entry's
  name, which on-disk is `Plan.theta` — but no sentence contemplates an
  explicit file reference whose spelling differs from the on-disk name (a state
  only case-insensitive hosts can reach).
- **Related:**
  - [0331](./0331-theta-root-marshalling-flattens-source-priority.md)
    — fixed (0.323.0). Established the parent/child discovery-skew class this
    report's direction (i) lands in: the child re-derives discovery from the
    root union, so any parent-side judgment made from data the child cannot
    re-derive (there: source priority; here: the entry's spelling of the
    filename) skews. The winner-path carrier its fix added does not help here —
    the child's walk never produces a candidate for the slug at all: the
    drop happens in `validateAndRead` (`:1229`), BEFORE `resolveSlashNames`
    and its marked-root arm, so the winner carrier never sees a candidate
    for the slug (reproduction step 3).
  - [0075](./0075-symlinked-root-classified-wrong-type.md) —
    fixed (0.195.0). Adjacent, not subsuming: its §Fix Option B added a
    `realpath` step for the file case, but that step lives inside
    `classifyResolvedTarget` (`discovery-walk.ts:382`) and decides the
    path's CLASS only — the resolved path is discarded, and `resolveEntry`
    `case "file"` still derives both path and stem from the entry string
    (`:539–542`).
- **Affected** (verified at af476df2, v0.347.0):
  - `src/discovery/discovery-walk.ts:539–542` — `resolveEntry` `case "file"`:
    `stem: splitExtension(basename(path)).stem` over the ENTRY path (CLI
    `--theta` file components and settings literal file entries).
  - `src/discovery/discovery-walk.ts:907–920` — `addFile` (settings glob
    matches and `+` re-admissions): same derivation from `absPath` (the
    resolved ENTRY spelling) at `:920`.
  - `src/discovery/discovery-walk.ts:1229` — `validateAndRead` tests
    `SLASH_NAME` against that entry-derived stem; the on-disk name is never
    consulted (no `readdir` of the parent, no `realpath`, on the explicit-file
    path).
  - Child side: `src/discovery/discovery-walk.ts:479–485` /` :1229` — the child
    reaches the same file only through directory enumeration
    (`enumerateDirectory`), whose candidates carry the on-disk `readdir` name;
    `Plan` fails `SLASH_NAME` (error) and the slug never enters
    `resolveSlashNames`, so the marked-root winner carrier
    (`:1330–1345`) finds no candidate and the ordinary adjudication registers
    nothing for it.

## Summary

For an explicit `.theta` file reference (CLI `--theta` component, settings
`thetaPaths` literal or glob match), the discovery walk derives the slash name
from the reference's own basename. A case-insensitive filesystem resolves a
case-variant reference to the real file, so the registered name and the on-disk
name can disagree. Both directions diverge from DISC-3: an on-disk
`Plan.theta` (invalid stem, must refuse) registers silently as `/plan` when
the entry spells it lowercase, and an on-disk `good.theta` (valid stem) is
refused `invalid-slash-name` when the entry spells it `GOOD.theta`. The
accepted direction then breaks the RFC-0006 subagent contract: the child
re-discovers from the root union by enumerating the parent directory, sees the
real `Plan.theta`, refuses it, and the marked root never registers — every
subagent-mode invocation of the parent-registered theta settles
`Err(InvokeInfraError { cause: "load_failure" })`.

## Reproduction

Offline, real filesystem, worktree at af476df2. Scratch root `<R>` with
`<R>/x/Plan.theta` and `<R>/x/good.theta` (both valid subagent-mode thetas).
Drive `discoverThetas` with the production `PiFileSystem`:

1. `settings: { thetaPaths: ["<R>/x/plan.theta"] }` →
   `thetas: [{"name":"plan","path":"<R>/x/plan.theta","source":"settings"}]`,
   `diagnostics: []`. (On-disk name is `Plan.theta`.)
2. `settings: { thetaPaths: ["<R>/x/GOOD.theta"] }` → `thetas: []`,
   `diagnostics: ["error theta/load/invalid-slash-name: slash names must be
   lowercase kebab/snake; rename the file (e.g. \`code-review.theta\`)"]`.
   (On-disk name is `good.theta`, whose stem is legal.)
3. Child-side chain: `cliPaths: ["<R>/x"]`,
   `markedRoot: { slug: "plan", winnerPath: "<R>/x/plan.theta" }` (exactly what
   the parent of (1) marshals per PIC-58/`PI_THETA_SUBAGENT_ROOT_WINNER`) →
   `thetas: [{"name":"good", …}]` — the slug `plan` is absent — plus the
   on-disk file's own `invalid-slash-name` error. The marked-root registration
   refusal (subagent.md §Marked-root registration refusal) then emits the
   `load_failure` envelope naming the slug.

## Expected behaviour

- `discovery-sources.md:76` (DISC-3 Filename validity): "The slash name is the
  theta's filename stem taken verbatim — no case-folding … Stems that do not
  match (e.g. … `Foo.theta` …) are rejected at load time with
  `theta/load/invalid-slash-name` (severity `error`); the file does not
  register". The theta in (1) is the file whose name is `Plan.theta`; its stem
  is `Plan`; the mandated outcome is the error and no registration. In (2) the
  file's name is `good.theta`; its stem is legal; the entry names an existing
  `.theta` file, so no failure-mode row and no validity row refuses it.
- `discovery-sources.md:85`: collision detection runs on "the filename stem
  taken verbatim" — the FILE's stem, not the reference's.
- Consistency across the process boundary: subagent.md's launch contract has
  the child "re-discover the callee `.theta`" from the marshalled root union;
  a theta the parent registers from an explicit file entry must be
  re-derivable in the child, else the marked root cannot register
  (subagent.md §Marked-root winner-path carrier, §Marked-root registration
  refusal).

## Actual behaviour / root cause

The explicit-file arms never look at the directory entry: `resolveEntry`
`case "file"` and `addFile` take the stem from the entry string
(`discovery-walk.ts:542`, `:920`), and `validateAndRead` (`:1229`) validates
that spelling. `classifyPath` established only that SOME file answers the
reference (`lstat`/`readdir` through the case-insensitive filesystem). Nothing
compares the reference's basename against `readdir` of the parent (the
IMP-1-style byte-exact check the `.thetalib` resolver performs) and nothing
canonicalises via `realpath` (the treatment the non-canonical-extension dedup
in the SAME function applies at `:497–518`). The registered candidate carries
the entry-spelled path and stem; the child, reaching the same file through
enumeration, carries the on-disk ones; the two passes disagree about whether
the slug exists.

## Why it matters

Direction (i) mints a slash command from a file the spec orders refused, under
a name that matches neither the file nor what a sibling machine (or the same
machine's subagent child) derives — author intent and spec intent both dropped
with zero diagnostics, then a wrong-cause `load_failure` on every subagent-mode
call. Direction (ii) refuses a well-formed on-disk theta because of the
reference's typing, with a hint ("rename the file") that points at the wrong
artefact — the file needs no rename. Case-variant references are ordinary on
Windows: nothing on the platform ever corrects them.

## Non-goals

- Extension-case variance in the ENTRY (`plan.THETA`) is correctly refused
  (`theta/load/invalid-extension`) per lexical.md §Extension matching — the
  byte-exact extension check is explicitly defined over the entry text; not a
  defect.
- Directory entries and conventional roots are unaffected: their candidates
  come from `readdir` and already carry on-disk names.
- The cross-platform observation that (1)'s settings file behaves differently
  on a case-sensitive host (missing-source error) is inherent to
  case-insensitive resolution, not part of this defect.

## Fix

Derive the stem from the on-disk directory entry for explicit file references:
after `classifyPath` answers `file`, `readdir` the parent and locate the entry
the filesystem resolved (unique on a case-insensitive host; byte-equal on a
case-sensitive one), then take stem AND candidate path from that entry —
making the explicit-file arm consistent with the enumeration arm and with the
`.thetalib` resolver's posture. Equivalent alternative: `realpath`-canonicalise
the candidate before stem derivation (realpath.native returns on-disk casing).
Either way both directions close together: (1) becomes `invalid-slash-name` on
the real stem `Plan`; (2) registers `/good` from the real stem. One spec
sentence under DISC-3 should pin the on-disk name as the stem source for
explicit references.

## Provenance

windows-paths bug-hunt sweep, af476df2 (v0.347.0). Probe:
`tests/scratch-winpaths-discovery.test.ts` cells P1/P2/P6 (deleted after the
run) — real NTFS scratch root via `PiFileSystem`, `discoverThetas` driven
directly; outputs as quoted in §Reproduction.

## Fix (0.355.0)

- What shipped:
  - `src/discovery/discovery-walk.ts` — new `onDiskFileCandidate(fs, path)`
    derives an explicit `.theta` file reference's slash-name stem AND candidate
    path from the ON-DISK directory entry (`readdir` the parent; a byte-exact
    name wins, else the case-insensitive fold; a bare drive spec `X:` is
    `readdir`'d as `X:/`; reference-spelling fallback when the parent is
    unenumerable). Wired into both explicit-file arms named in §Fix:
    `resolveEntry` `case "file"` (CLI `--theta` / settings literal) and the
    settings-collector `addFile` (glob matches / `+` re-admissions). The
    byte-exact extension check stays over the ENTRY text (§Non-goals 1) and
    `selected` stays keyed by the entry-spelled path so the DISC-5 `!`/`-`/`+`
    drop operands still match. `validateAndRead` now judges the on-disk stem
    with no change of its own.
  - `docs/spec_topics/discovery/discovery-sources.md` — DISC-3 "Filename
    validity" gains one sentence pinning the on-disk directory entry as the
    stem source for explicit file references (the stem-casing invariant; the
    extension stays subject to the byte-exact check).
- Gates: witness `npx vitest run tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts`
  4/4 green; full default suite 531 files / 10024 tests green (one
  concurrent-load timeout in `shared-subtree-judged-once-per-pass-not-once-per-path`,
  green in isolation, off the discovery surface); `npm run typecheck` clean;
  `npm run lint` clean.
- Review: 2 rounds. R1 (`bug-fix-reviewer`) → FINDINGS: F1 spec-blocker (DISC-3
  over-claimed casing invariance vs the extension check), F2 test (witness the
  on-disk candidate PATH in the registering direction), F3 correctness
  (drive-root `readdir("X:")` is drive-relative on Windows). F4 declined
  (sanctioned b0329 reporter-label pattern); R1-residual recorded below. R2
  (`bug-fix-reviewer-fast`) → CLEAN (F1/F2/F3 resolved, no new findings).
- Verification: SOLID. Witness — revert→RED (A/E register `/plan` silently with
  zero diagnostics; B refuses the legal on-disk stem `good`) → restore →
  GREEN (4/4). Full suite — green (numbers above; the one red was a load-noise
  timeout, green isolated). Live — no live cell is prescribed by the doc; the
  adjacent CLI `--theta` discovery→registration cell
  `tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts`
  ran 1/1 green through the real production composition root under the shared
  live lock, exercising the modified `resolveEntry` explicit-file arm
  end-to-end (recorded WHY). Lint + typecheck — clean.
- Residuals:
  1. Extension-case sibling (reviewer R1): on a case-insensitive host an on-disk
     extension-case variant (`good.THETA`) reached by an explicit reference
     spelled `good.theta` still registers — a file the byte-exact rule says is
     "not a `.theta` file at all", so it stays invisible to enumeration and the
     child-side skew persists for it. Pre-existing (pre-fix it also registered,
     under the entry-spelled path; this fix changed only the recorded path to
     the honest on-disk one). Extension-side, outside this §Fix and adjacent to
     §Non-goals bullet 1 — candidate for its own bug report, not widened here.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: §Non-goals bullet 1 upheld — an entry whose
  extension is mis-cased (`plan.THETA`) stays `theta/load/invalid-extension`
  (the check is kept over the entry text). `readdir` was chosen over `realpath`
  so symlink/junction leaf semantics stay consistent with the enumeration arm
  (0075) and clear of the 0331 separator-normalised identity dedup and the
  0329/0330 realpath drop-target canonicalisation — all untouched. Lane sibling
  0379 (tools-derived-name-judged-on-entry-spelling) fixes
  `src/parser/callable-set.ts` (`thetaDefaultName`), DISJOINT from this change;
  no shared fix site.
