# Bug 0361 — A case-variant directory spelling in a `.thetalib` import path splits one physical file into two declaring identities on a case-insensitive host: the same `enum` declaration reached via `../LIBS/` and `./libs/` mints two declaring-enum tags so its own variants compare `==` false with zero diagnostics, and a re-export diamond over two such spellings draws a false `theta/parse/import-name-collision` on a program whose edges resolve to one declaring file

- **Status:** fixed (0.353.0).
- **Sev/Diff estimate:** S1/D2 — S1 on face (a): a value comparison the spec
  fixes as `true` evaluates `false` with zero diagnostics at any phase, wire
  output identical on both sides (`JSON.stringify` prints the bare wire string),
  so the divergence surfaces only as a wrong branch/match decision — the same
  impact letter as bug 0337, whose input class (same name, different files) is
  this report's mirror (same file, different path spellings). Face (b) is a
  false refusal of a Windows-legal program (impact 2). D2: the fix is one
  identity mint — canonicalise the resolved `.thetalib` path (the corpus
  already owns the function: `canonicalizePath`, `src/runtime/invocation.ts:142`,
  "mints the canonical path identity … the `.thetalib` import-edge-graph node
  identity") before it is used as `enumDeclaringKey` input and as the
  declaring-site collision key — plus a spec sentence pinning file identity for
  declaring sites on case-insensitive hosts.
- **Kind:** defect against `runtime-value-model.md:29` on face (a), with a spec
  gap underneath (imports.md pins byte-for-byte identity for the FINAL segment
  only and says nothing about how two resolved-path spellings of one physical
  file relate); defect against `imports.md:126`'s diamond exemption on face (b).
- **Related:**
  - [0305](./0305-enum-identity-minted-from-alias.md) — fixed (0.298.0
    era). Established the declaring-key scheme this report measures: the NAME
    half (alias vs declared name) was fixed by keying on
    `(resolvedPath, declaredName)`; this report is the PATH half — the
    `resolvedPath` component itself is not an identity on a case-insensitive
    filesystem.
  - [0337](./0337-theta-enum-identity-collides-across-in-process-invoke.md)
    — fixed (0.305.0). The mirror direction: two distinct declarations minting
    ONE tag. This report: one declaration minting TWO tags.
  - [0302](./0302-stem-keyed-cycle-graph.md) — fixed
    (0.292.0). Moved the cycle-graph node identity from basename stem to
    resolved path; this report shows the resolved-path string still is not file
    identity on Windows. (The cycle face itself does NOT reproduce — see
    §Non-goals.)
  - [0329](./0329-hash-mismatch-refusal-does-not-refuse-invocation.md)
    — fixed (0.322.0). Its fix comment
    (`src/extension/production-composition.ts:1317–1321`) already states the
    governing rule for a sibling seam: "locate the callee-to-drop by CANONICAL
    real path, not a case-sensitive string compare. On a case-insensitive
    filesystem an author-written case-mismatched `tools:` spelling still
    resolves to the real file … a raw string compare … would miss". The import
    layer never received that treatment.
- **Affected** (verified at af476df2, v0.347.0):
  - `src/parser/imports.ts:213` — `RelativeThetaLibResolver.resolve`:
    `posix.join(posix.dirname(fromFile), spec)`. The resolved path inherits the
    spec's directory-segment case verbatim; IMP-1's byte-for-byte check
    (`:219–229`) guards the final segment only, and `probe.entries(parent)`
    (a real `readdir`) succeeds for a case-variant parent on a case-insensitive
    filesystem.
  - `src/extension/import-static-checks.ts:142` and `:261` —
    `declaringKey: enumDeclaringKey(resolvedPath, …)` minted from that
    un-canonicalised resolved path (both the re-export chase and
    `materializeSymbol`).
  - `src/runtime/lexical-environment.ts:132–134` — `enumDeclaringKey` is
    `` `${resolvedPath}#${declaredName}` ``; `src/runtime/value.ts` equality
    compares the tag strings.
  - `src/extension/import-static-checks.ts:650–676` — `resolveDeclaringSite`
    keys the collision site as `` `${lib}\u0000${name}` `` over the same
    un-canonicalised lib paths (bug 0334's key).

## Summary

`.thetalib` import resolution joins the literal against the importer's
directory and uses the resulting string as the file's identity everywhere
downstream: cycle-graph node, parse-cache key, declaring-enum tag, and
re-export collision site. IMP-1 makes the FINAL segment byte-exact against
`readdir` output, but a case-variant DIRECTORY segment (`../LIBS/` for on-disk
`libs/`) resolves cleanly on Windows — `readdir` of the case-variant parent
succeeds — so one physical file acquires two resolved-path identities. The
declaring-enum tag then differs between the two spellings, so two variants of
the one declaration compare `==` false (spec: true), and a re-export diamond
whose two edges spell the shared directory differently draws
`theta/parse/import-name-collision` (spec: exempt — same terminal declaring
site).

## Reproduction

Offline, real filesystem (case-insensitive NTFS), worktree at af476df2. Scratch
layout under a temp root `<R>` (forward-slash spellings):

```
<R>/libs/color.thetalib          enum Color { Red, Green }
<R>/libs/helper.thetalib         import { Color } from "../LIBS/color.thetalib"
                                 fn pick(): Color { Color.Red }
<R>/libs/shared/p.thetalib       fn who(): string { "p" }
<R>/libs/a.thetalib              export { who } from "./shared/p.thetalib"
<R>/libs/b.thetalib              export { who } from "./Shared/p.thetalib"
<R>/libs/diamond.thetalib        export { who } from "./a.thetalib"
                                 export { who } from "./b.thetalib"
```

Drive `checkThetaImports` with the production `PiFileSystem` (real
`readdir`/`readBytes`) and run the body through
`createProductionProducerDeps` → `executeBody` (the bug-0305 test harness
shape, `tests/b0305-enum-alias-identity.test.ts`, with the fake FS replaced by
`PiFileSystem`).

Face (a) — app body:

```
import { Color } from "./libs/color.thetalib"
import { pick } from "./libs/helper.thetalib"
let a = pick()
let eq = a == Color.Red
eq
```

Observed: load diagnostics `[]`; settled value `false`.
Control (helper spelled `../libs/color.thetalib`): diagnostics `[]`; value
`true`.

Face (b) — app body `import { who } from "./libs/diamond.thetalib"` + `who()`:

Observed:
`error theta/parse/import-name-collision: imported symbol 'who' collides with another import or top-level declaration`
(error severity un-registers the theta in production). Control
(`b.thetalib` spelling `./shared/p.thetalib`): diagnostics `[]`.

On a case-sensitive host the `../LIBS/` and `./Shared/` spellings are
unresolvable (`theta/load/unresolvable-thetalib-path`), so both programs are
Windows-legal inputs specifically.

## Expected behaviour

- `runtime-value-model.md:29`: "For an imported or re-exported enum, the tag
  identifies the declaring declaration — the declaring `.thetalib` **file**
  together with the declared name … variants reached under different aliases,
  or once directly and once through a re-export rename, compare equal". One
  physical file, one declared name → one tag → `eq` is `true`.
- `imports.md:126`: "A diamond — one declaration reached through two re-export
  paths, both edges resolving to the SAME declaring site — is exempt: the
  collision key is the terminal declaring site". Both edges resolve (open,
  parse, and read) the one physical `p.thetalib`, so the program is exempt and
  loads clean.
- `imports.md:23` (IMP-1) pins byte-for-byte identity for the final segment
  against `readdir` bytes; it prescribes nothing that would make two
  successfully-resolved spellings of one file distinct declaring sites.

## Actual behaviour / root cause

`RelativeThetaLibResolver.resolve` (`src/parser/imports.ts:213`) returns the
`posix.join` of the literal against the importer's directory with no
canonicalisation; every downstream identity — `enumDeclaringKey`
(`src/runtime/lexical-environment.ts:132`), the collision site key
(`src/extension/import-static-checks.ts:655`), the parse cache and walk keys
(`import-static-checks.ts:412`, `:448–495`) — is that string. On a
case-insensitive filesystem the directory-segment case never confronts the
disk (only the final segment is compared against `readdir` output), so
`<R>/LIBS/color.thetalib` and `<R>/libs/color.thetalib` are two identities for
one file: two tags (face a), two declaring sites (face b), and one extra parse
of the same bytes per spelling.

The corpus already owns the correct identity mint for exactly this reason:
`canonicalizePath` (`src/runtime/invocation.ts:134–147`) is documented as "the
one function that mints the canonical path identity the containment check, the
static-resolution per-pass parse cache key, and the `.thetalib`
import-edge-graph node identity all compare under; consumers reuse it rather
than restating it" — but the `.thetalib` import layer does not consume it
(`src/parser/imports.ts` and `src/extension/import-static-checks.ts` never call
`realpath`). That doc-comment already claims to mint "the `.thetalib`
import-edge-graph node identity" — an overclaim at HEAD: no import-layer
code honours it, so the comment documents the identity regime this fix
installs rather than the shipped behaviour.

## Why it matters

Face (a) is a silent wrong value in the language's own equality: `match` arms
and `if` branches keyed on an enum comparison take the wrong path with no
diagnostic anywhere, and the wire form of both operands is identical, so the
defect is invisible in transcripts and envelopes. Case-variant directory
spellings are ordinary on Windows (the filesystem never corrects them; tab
completion and habit produce them). Face (b) refuses a legal program at load
with a diagnostic naming a collision the source does not contain.

## Non-goals

- The import-CYCLE face does not reproduce: a case-variant back-edge respells
  the whole downstream subgraph (each shadow node re-derives its edges from
  relative literals), so any physical cycle re-closes within the shadow
  spelling and `theta/load/import-cycle` still fires — probed both directions.
  No claim is made against `detectImportCycle`.
- The sibling defect on the `invoke(...)` graph (edges dropped, cycle missed)
  is a separate mechanism in a separate subsystem —
  [bug 0362](./0362-invoke-cycle-graph-drops-case-variant-edges.md).
- Unicode NFC/NFD path spellings: out of scope; lexical.md pins no-folding and
  NTFS does not normalise, so those are genuinely distinct entries.

## Fix

Canonicalise once at the resolver boundary: after `RelativeThetaLibResolver`
verifies the final segment byte-for-byte, mint the returned path through the
existing `canonicalizePath` (`fs.realpath` + forward-slash), so every
downstream key — declaring tags, collision sites, cycle nodes, parse caches —
compares under the on-disk spelling. `realpath.native` preserves byte identity
on case-sensitive hosts (no behaviour change there) and canonicalises case on
Windows. Cost: one `realpath` per resolved edge, cacheable beside the existing
probe cache. Alternative (rejected): case-fold the key — wrong on
case-sensitive hosts and contradicts the corpus's "no independent
case-folding" stance (invocation.md §Resolution). A spec sentence should pin
declaring-site identity to the canonical (`realpath`) form, mirroring
invocation.md's containment wording.

## Provenance

windows-paths bug-hunt sweep, af476df2 (v0.347.0). Probes:
`tests/scratch-winpaths-import-identity.test.ts` (deleted after the run) —
six cells (A/B/C × variant/control) over a real NTFS scratch directory via
`PiFileSystem`; face (a) and face (b) observed as quoted, cycle face probed
clean both directions.

## Fix (0.353.0)

- What shipped:
  - `src/parser/imports.ts` — `ThetaLibDirectoryProbe` gains `canonicalize(resolvedPath)`; `RelativeThetaLibResolver.resolve` returns `this.probe.canonicalize(resolved)` after the byte-exact final-segment check (§Fix: canonicalise once at the resolver boundary). IMP-1's final-segment rejection is untouched — only case-variant DIRECTORY segments fold.
  - `src/extension/import-static-checks.ts` — `CachingThetaLibProbe` precaches the canonical form through the existing `canonicalizePath` (`fs.realpath` + forward-slash) into a `canonicalCache`, guarded independently of the parent-listing early-return (so a second lib under an already-listed variant parent still folds), and serves it with an identity fallback (§Fix: through the existing `canonicalizePath`, cacheable beside the probe cache). Every downstream key — `enumDeclaringKey` tag, `resolveDeclaringSite` collision key, cycle-graph node, per-pass parse cache — now receives the canonical identity unchanged.
  - `docs/spec_topics/imports.md` — one normative sentence in §Path resolution pinning declaring-site / import-graph / parse-cache identity to the resolved path's canonical `FileSystem.realpath` form, mirroring invocation.md's containment wording (§Fix: spec sentence).
  - `tests/imports.test.ts` — the fake `ThetaLibDirectoryProbe` gains an identity `canonicalize` (interface conformance; no assertion changed).
- Gates:
  - Witness `tests/b0361-case-variant-import-dir-identity.test.ts` — 5 cells GREEN (real `PiFileSystem`, host-adaptive both-branch, no silent skip). Reverting `resolve` to the raw path reds cells (a)/(a2)/(b) with the pinned signatures (`expected false to be true`; `[false,false]` vs `[true,true]`; collision falsely present).
  - Full suite `npm test` — 9975 passed / 50 skipped / 10025 total; the single red was a `beforeEach` hook timeout on `production-tools-load-resolution.test.ts` (green in isolation — parallel-load flake, not this surface).
  - Typecheck `tsc -p tsconfig.json --noEmit` clean; lint `eslint src/**/*.ts` clean.
  - Live `tests/live/b0305live-imported-enum-alias-identity-live-cell.test.ts` GREEN (adjacent declaring-identity cell). WHY this cell: my change is byte-identity for legal non-case-variant programs (`realpath.native` is identity on already-on-disk-cased paths), so no existing live-tested input class changes outcome; the case-variant class has no live cell and the LPA is line-pinned.
- Review: 1 round — `bug-fix-reviewer` CLEAN (no correctness/fidelity/spec/house-rule defect). Residual R1 (missing regression-lock for the guard-before-early-return invariant) fixed via one `bug-fix-fixer-light` hardening round adding cell (a2); post-polish confirmation round skipped (test-only diff, gate-verified green).
- Verification: `bug-fix-verifier` SOLID — witness reds-without-fix / greens-with-fix (byte-exact restore proven via `git diff`), full suite green, lint+typecheck clean, live delegated green, tree exactly the owned set.
- Residuals:
  1. R3 (doc parenthetical, non-blocking): §Fix's "no behaviour change on case-sensitive hosts" is exact for CASE only; `realpath` also folds symlink components on every host, so a symlink-reached lib now mints its target's identity on case-sensitive hosts too — the settled mechanism's inherent, correct effect (matches invocation.md's "after `realpath` symlink normalisation" containment precedent) and the new spec sentence pins the `realpath` form honestly. No code or spec defect.
  2. R2/R4 (non-blocking): Phase-5 companion artifacts (version bump, CHANGELOG, README index) are deferred to the merge parent per lane policy; `Ran.raw` in the witness is an unused helper field (cosmetic).
- Discharge notes appended: none.
- Pinned dispositions / non-goals: import-cycle face does not reproduce (§Non-goals; unchanged); the `invoke(...)` case-variant-edge face is bug 0362 (sibling-owned, untouched); Unicode NFC/NFD path spellings out of scope (unchanged).
