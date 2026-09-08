# Bug 0467 — the callable-closure digest depends on path-separator spelling, so a subagent-mode `.theta` callee importing a `.thetalib` whose path sorts before the callee root in backslash form is refused `theta/runtime/subagent-callable-hash-mismatch` on every tool-call/`invoke` dispatch from a parent theta, with byte-identical files and no edit — while the same callee dispatched directly by slash runs

- **Status:** open.
- **Sev/Diff estimate:** S2/D2 — S2: loud-but-wrong at production scale. Every
  parent→child tool-call invocation of an affected callee fails closed before
  any model turn; in the seeding incident 212/212 `triage_finding(...)` calls
  returned Err in one `/quality-loop` run, the theta's own `Err(...)` fallback
  then marked all 212 candidates `questionable`, and the wave's whole triage
  budget was burnt. The diagnostic also lies: a tamper/divergence-shaped
  message (registry-pinned "content hash mismatch; refusing invocation") fires
  on a workspace where nothing changed, the same trust-burning failure shape
  bug 0330 documented for the key-space leg. Not S1: the refusal is loud
  (`Err(invoke_infra)` + the load_failure envelope naming the code) and no
  wrong value crosses a boundary. Windows-only manifestation: a POSIX host's
  `resolve` emits forward slashes, so both routes produce one spelling and
  the class cannot fire there — bounding the affected population, not the
  severity on affected hosts. D2: the mechanical fix is small but needs
  one adjudication (canonicalise member paths vs. make the digest a true set
  hash), plus route-complete witnesses across both capture sites and a
  one-sentence spec clarification at subagent.md:94.
- **Kind:** defect. subagent.md pins the marshalled value as "a **content hash
  of the transitive closure** of the root callee `.theta` plus every
  `.thetalib` import" (docs/spec_topics/pi-integration-contract/subagent.md:94),
  and the hash module's own contract says the digest is content-only and
  order-independent ("The hash MUST … be independent of the input array's
  order"; "The path itself is NOT hashed into content … only each member's
  exact content contributes" — src/runtime/subagent-callable-hash.ts:47-57).
  The shipped digest is a function of contents *in raw-path sort order*, and
  the two production routes spell the same member set differently, so two
  computations over identical closure content disagree. A mismatch is
  spec-defined to mean "a file edit between parent load and child spawn"
  (subagent.md:94); here it fires with zero edits.
- **Related:**
  - [0268](./0268-load-notes-render-same-file-with-mixed-path-separators.md)
    (fixed 0.265.0) — the separator convention this site never adopted. Its
    §Fix "Convention chosen and why" establishes the repo-wide convention:
    POSIX forward slash — "The repository already normalises Win32 to POSIX
    at seven source sites and the reverse at none", quoting
    `import-static-checks.ts:92`'s comment naming forward slash "the
    normalised comparison form per Lexical §Path literals; the `FileSystem`
    seam reports forward-slash paths". Its refused mint-seam candidate names
    this exact seam by name and line — "the `path.resolve` results in
    `collectCallableClosureSources`" — refused because that seam "reaches
    paths used for more than rendering" and "moves paths that resolution,
    containment and the closure walk's `seen` set consume"; the refusal
    rationale weighed resolution and containment, never hash ordering. And
    its §Non-goals asserts, byte-exact: "Path resolution, containment
    (`checkInvokePathAtLoad`), discovery-root comparison and cache keying
    already compare normalised forms and are correct" — a claim this defect
    falsifies for the one consumer that ORDERS on the raw string. This
    framing constrains the fix to the normalise-at-capture /
    normalise-both-sides options ((A)/(B) below): leaving raw spellings in
    the digest input re-contradicts the convention 0268 pinned.
  - [0330](./0330-as-renamed-callable-spurious-hash-mismatch.md)
    (fixed 0.307.0) — the sibling false-positive leg of the same code:
    key-space misalignment made the child unable to LOCATE a renamed callee's
    sources (`observed <child source unavailable>`). This report is the other
    leg: sources located fine, digest computed over the same bytes, and the
    *order* diverges. Not a re-observation of 0330's fixed mechanism — the
    rename/snapshot resolution works at this pin (no rename involved), and
    the hint here carries two real digests, not `<child source unavailable>`.
    0330's fix added the child's pass-1 snapshot resolution
    (`production-composition.ts:1462-1470`), which computes `tools:`-entry
    rows through `resolvePath` on the child side — the same backslash shape
    the parent produces for those rows — so that pair is ALIGNED. The
    surviving divergence is confined to bug 0328's root-row key space: the
    child's pass-2 fallback (`:1486-1501`, forward-slash discovery root) vs
    the dispatch-parse capture (backslash).
  - [0328](./0328-root-callee-closure-hash-never-marshalled.md)
    (fixed 0.306.0) — the fix that created both parent-side capture sites,
    including the dispatch-parse threading this report faults
    (`parseCalleeTheta` return carries `rootClosureHash`; 0328 §Fix names it).
    NOT a rebreak: 0328's mechanism (the root's own row present in the
    marshalled map, additive `Object.hasOwn` write) works at this pin —
    `production-theta-producer.ts:2430-2433` writes the row and the child's
    pass-2 fallback resolves it. Its witness cell 1b
    (`tests/b0328-root-closure-hash-marshalled.test.ts:188-220`) records the
    sensitivity verbatim — "`hashCallableClosure` sorts by path, so the path
    STRINGS must match production's (the separator flavour affects sort
    order)" (`:206-209`) — but replicates the DISCOVERED-root spelling on
    both sides of its comparison, so its fixture pair (`zqx2-lib.thetalib` /
    `zqx2-root.theta`) can never flip order between the two sides it
    compares; the dispatch-parse route — the only route that spells the root
    differently from the child — got no order-divergence witness. 0328
    noticed the sensitivity, pinned only the non-flipping route, and left
    this leg latent.
  - [0329](./0329-hash-mismatch-refusal-does-not-refuse-invocation.md)
    (fixed 0.322.0) — the enforcement (any refusal drops the marked root →
    PIC-59 load_failure envelope) that turned this latent digest divergence
    into hard uninvokability. Working as specified; not a rebreak.
  - [0312](./0312-out-of-root-thetalib-edits-invisible-stale-imports.md)
    (fixed 0.315.0) — true-positive mismatches from genuinely stale imports.
    Distinct: this report's refusal fires with no edit anywhere.
  - [0002](./0002-subagent-child-hangs-under-acceptance-pi-p.md)
    — child-pin harness lineage only (the probe uses the #subagent-child-pins
    recipe).
- **Affected** (at c9a1a45a, v0.462.0):
  - `src/runtime/subagent-callable-hash.ts:59-68` — members sorted by raw
    `path` string; contents hashed in that order (length-prefixed).
  - `src/extension/production-composition.ts:3465-3466`
    (`parseCalleeTheta`) — the dispatch-parse `absolute` is built with node
    `resolve` (backslash-normalised on Windows) from the caller's dir + the
    `tools:`/`invoke` literal.
  - `src/extension/production-composition.ts:3553-3563` — that dispatch parse
    threads `rootClosureHash` (computed over the backslash spelling) onto the
    callee input the spawn marshals.
  - `src/extension/production-composition.ts:3603-3641`
    (`collectCallableClosureSources`) — the root member's `path` is the
    caller-supplied spelling passed through unchanged (`rootAbs`, :3604);
    every `.thetalib` member is node-`resolve`d (:3638-3641), i.e. backslash.
  - `src/extension/production-composition.ts:2310-2322`
    (`captureRootClosureHash`) — the discovered-root capture, over
    `parsed.sourcePath` (discovery spelling).
  - `src/extension/production-composition.ts:1486-1501` — the child-side
    fallback pass recomputes the marked root's row over the child-discovered
    `theta.sourcePath` (discovery spelling).
  - `src/discovery/discovery-walk.ts:155-162, 1219` — discovery constructs
    paths as `<cwd>` + forward-slash joins (`joinPosix`), so a discovered
    `sourcePath`'s tail separators are `/` while node-`resolve`d paths are
    `\` — the two spellings of the same file.
  - `src/extension/production-theta-producer.ts:4171` (`#driveCallee` →
    `parseCallee(theta.sourcePath, calleePath)`), `:2431-2433` (root row
    marshalled), `:2565-2568` (env carrier).
  - `src/runtime/subagent-child-hash-verify.ts:154-174` (`verifyOne`) — the
    compare that turns the divergence into the fail-closed refusal.
  - `docs/spec_topics/pi-integration-contract/subagent.md:94` — defines the
    hash by CONTENT over a SET; silent on path spelling as a hash input
    (`:96` already pins "separator-normalized path identity" for the child's
    winner-path walk). Owes the clarifying sentence under §Fix.
- **Observed at:** v0.462.0 (c9a1a45a), offline — deterministic vitest probe
  (deleted after confirmation; full recipe below) driving the real child-load
  wiring in both directions and real spawned `pi` child processes end-to-end
  (zero tokens; #subagent-child-pins per AGENTS.md). Matches the live
  incident measured by the fix-campaign coordinator the same day in BOTH
  trees at v0.462.0 (4 model spellings, 1- and 2-param callees — all refused
  identically; direct slash dispatch of the same callee ran clean).

## Summary

`hashCallableClosure` hashes closure members' contents in ascending raw-path
order. The path never enters the hash bytes, but it decides the concatenation
order, so the digest is a function of *(contents, path spelling)*. Production
constructs the same closure with two different spellings:

- **Discovered-root capture** (slash dispatch) and the **child's recompute**:
  root = discovery spelling (`<cwd>/.pi/theta/...`, forward-slash joins),
  imports = node-`resolve` (backslash). At the first divergent character
  (`/` 0x2F vs `\` 0x5C) the root sorts BEFORE every backslash import, so the
  order is root-first regardless of basenames.
- **Dispatch-parse capture** (a `.theta` callee reached through a parent
  theta's `tools:` call or `invoke(...)` literal): root = node-`resolve`
  backslash absolute, imports = the same. Order is plain lexicographic over
  the backslash paths — for same-directory files, basename order.

When an imported `.thetalib` basename sorts BEFORE the callee root's basename
(`quality.thetalib` < `triage-finding.theta`), the dispatch-parse capture
orders lib-first while the child orders root-first: two different sha256
digests over identical bytes → `verifyOne` refuses → bug 0329's enforcement
drops the marked root → the parent receives
`Err(invoke_infra, cause=load_failure)` whose message is the incident string
verbatim. When the root basename sorts first (`lens-d2-cruft.theta` <
`quality.thetalib`) both routes agree and the invocation runs — which is
exactly the incident's asymmetry (73 lens successes, 212 triage refusals in
one session). Windows-only: POSIX `resolve` emits forward slashes, so both
spellings coincide there.

## Reproduction

Verification status, per cell: step 1 (the mechanism — the digest
computation) was re-derived independently at c9a1a45a, twice: over the
synthetic fixtures below and over the operator's real workers (four digests
pinned below). Steps 2 and 3 ran once with real spawned children in the
original probe (deleted after confirmation) and were subsequently re-audited
statically against the cited code paths, not re-run; the report stands on
the step-1 offline digest computation plus the live incident measurement at
the end of this section.

Offline, deterministic, zero tokens (probe file deleted; reproduce as
follows). Workspace under a temp dir:

```
.pi/settings.json           {}
.pi/theta/mmm-lib.thetalib  fn greet(): string {\n  return "zqx-lib-ok"\n}
.pi/theta/zzz-callee.theta  ---\nmode: subagent\n---\nimport { greet } from "./mmm-lib.thetalib"\ngreet()
.pi/theta/aaa-callee.theta  (byte-identical body to zzz-callee)
.pi/theta/flip-caller.theta ---\nmode: prompt\ntools:\n  - ./zzz-callee.theta\n---\nlet v = zzz_callee()?\n…
.pi/theta/ctrl-caller.theta (same, over ./aaa-callee.theta; success path then
                             trips `invoke("./got-lib-ok.theta")?` — a missing
                             target — only when v == "zqx-lib-ok", so the note
                             positively witnesses the callee ran)
```

Module-scope pins per AGENTS.md `#subagent-child-pins` (argv[1] → the repo's
pi CLI entry; `PI_THETA_SUBAGENT_EXTENSION_PIN` → this tree's `extensions/`;
`PI_THETA_SUBAGENT_PARENT_PID` → `String(process.ppid)`).

1. **Mechanism** — with `root` in the two spellings and the lib node-resolved:

   ```
   H(child spelling, zzz)  = sha256:276b2ce3858a46cfa62be0d427ce0076f33eae6e218aee293c1704e9cbc91a7c
   H(parent spelling, zzz) = sha256:877583f8f2c33b8ae7119cd5db92f6050a142e5cdbec53df43c9356e708cc143
   child root path : C:\Users\…\Temp\theta-scratch-…/.pi/theta/zzz-callee.theta
   parent root path: C:\Users\…\Temp\theta-scratch-…\.pi\theta\zzz-callee.theta
   ```

   Identical contents; digests differ. For `aaa-callee` (root basename before
   the lib) the two digests are equal.

2. **Child-side, real load wiring** (`discoverAndComposeFixtures` with
   `PI_THETA_SUBAGENT_ROOT=zzz-callee` + the carrier planted, authenticated):
   carrier `{zzz_callee: H(parent spelling)}` →

   ```
   theta/runtime/subagent-callable-hash-mismatch: subagent callable
   'zzz_callee' content hash mismatch; refusing invocation
     hint: expected sha256:877583f8…, observed sha256:276b2ce3…
   ```

   and `zzz-callee` is dropped from registration (0329 root drop). Carrier
   `{zzz_callee: H(child spelling)}` → no diagnostic, `zzz-callee` registers.
   The child's observed digest equals the discovery-spelling replication
   byte-for-byte — pinning which spelling each side computes.

3. **End-to-end, real spawned children** (`fixture.run` of each caller through
   the shipped composition root; the callee bodies are pure — zero tokens):
   - `flip-caller` → `theta /flip-caller returned Err: invoke of
     C:\…\zzz-callee.theta failed (load_failure)`, whose runtime event carries
     the incident message verbatim: `subagent child refused to register its
     root theta '/zzz-callee': theta/runtime/subagent-callable-hash-mismatch:
     subagent callable 'zzz_callee' content hash mismatch; refusing
     invocation`.
   - `ctrl-caller` → no refusal; the deliberate post-success trip note names
     `./got-lib-ok.theta`, proving `aaa_callee` ran in a real child and
     returned the lib-computed value (`v == "zqx-lib-ok"`).
   - Direct dispatch of the SAME `zzz-callee` fixture → no Err (the
     discovered-root capture and the child agree), matching the incident's
     "direct slash works" observation.

No file is written or edited between any load and any spawn at any point.

Operator-layout cross-check (`C:/UnitySrc/pi-theta/.pi/theta/workers/`,
read-only): `quality.thetalib` sits beside the workers and every worker
imports `./quality.thetalib`, so `q` is the pivot. The four digests,
recomputed at c9a1a45a with a faithful replication of `hashCallableClosure`
over the live files, both spellings (child = forward-slash discovery root;
parent = dispatch-parse backslash root; lib node-`resolve`d on both):

- `fix-cluster.theta` (f<q) — **MATCH**, invokable:
  `sha256:01792bc7f811c2a929670bee228fc002914d31361218c02ff6ff9b0a026a40a6`
  on both sides.
- `lens-d2-cruft.theta` (l<q) — **MATCH**, invokable:
  `sha256:ad3c06087ad3e254ab663a3b1a871c236b3b9561012adc9755ea70482f4c569b`
  on both sides.
- `review-fix.theta` (r>q) — **DIVERGE**, refused: child
  `sha256:29c69ae8b03a1b6878eef157efc10886de250a67b8f4bcddf660098ade5319d3`
  vs parent
  `sha256:eb93b0d210525c62aa7ea72bb1e8c9047c41e2e22dd2d27195061263de21d54d`.
- `triage-finding.theta` (t>q) — **DIVERGE**, refused: child
  `sha256:9dcb9a4245324eeaf91ab32fb33f989d734b0777e353d3849576cbab450f8340`
  vs parent
  `sha256:5d1cd91093a45e44b0455ba3a349ea25a3350332dcd9c0be5c347c644fb284f7`.

(Digest values are content-dependent — `triage-finding.theta`'s live copy
differs from commit c9a1a45a by one model-string line, and recomputing over
the commit content moves its two digest values — but the MATCH/DIVERGE split
depends only on path order and holds under both contents.)

This four-way split explains the whole incident — 73 lens successes, 212
triage refusals, every coordinator `scratch-*` probe (s>q) refused — with no
counter-example, and `review-fix`'s divergence predicts the loop's FIX phase
(`review_fix`) would have failed identically had triage ever produced a
confirmed finding (`review-fix` was never reached because triage confirmed
nothing).

Live incident measurement (both trees at v0.462.0, same day): every
`triage_finding(...)` dispatch returned, verbatim,

```
ERR kind=invoke_infra | cause=load_failure | message=subagent child refused
to register its root theta '/triage-finding':
theta/runtime/subagent-callable-hash-mismatch: subagent callable
'triage_finding' content hash mismatch; refusing invocation
```

reproduced across FOUR model spellings and BOTH param arities (1- and
2-param callees), while the same callee dispatched directly as a slash
command runs clean.

## Expected behaviour

- subagent.md:94 (`#subagent-theta-callable-hash`): the parent records "a
  content hash of the transitive closure" and the child "recomputes … from
  its own parse and compares"; a mismatch means "a file edit between parent
  load and child spawn". Identical on-disk closure content must therefore
  produce identical digests on both sides, whatever route resolved the paths.
- `src/runtime/subagent-callable-hash.ts:47-56` (module contract): "The hash
  MUST change when any closure member's content changes … and MUST be
  independent of the input array's order (the closure is a set)." A set hash
  that changes under re-spelling of member NAMES (which are exempted from the
  hashed bytes at :55-57) contradicts the stated set semantics.
- subagent.md:123: the refusal envelope exists for the child to name a REAL
  load refusal; a category-(4) wrong-signal diagnostic (divergence reported
  on identical content) is the same defect class 0330 was fixed for.

## Actual behaviour / root cause

`hashCallableClosure` (`subagent-callable-hash.ts:59-68`) sorts by raw
`source.path` and feeds contents to sha256 in that order. The root member's
`path` is whatever the caller passed (`collectCallableClosureSources`
`rootAbs`, `production-composition.ts:3604`): the discovery spelling on the
discovered-root capture (`captureRootClosureHash`, :2310-2322, over
`parsed.sourcePath`) and on the child recompute (fallback pass :1486-1501,
over the child-discovered `theta.sourcePath`), but the node-`resolve`
backslash spelling on the dispatch parse (`parseCalleeTheta`, :3465-3466,
threaded at :3553-3563 and marshalled at `production-theta-producer.ts:2431`).
Import members are node-`resolve`d on every route (:3638-3641). Discovery
builds `sourcePath` with forward-slash joins over the cwd
(`discovery-walk.ts:155-162, 1219`), so the root's tail separators are `/`
there and `\` on the dispatch parse. `/` (0x2F) sorts before `\` (0x5C), so
the child always orders the root first, while the dispatch parse orders by
backslash lexicographic comparison — lib-first whenever a transitively
imported `.thetalib` path sorts before the root. The digests then differ and
`verifyOne` (`subagent-child-hash-verify.ts:154-174`) refuses fail-closed.
Contrast the neighbouring marshal: `SUBAGENT_ROOT_WINNER_ENV` DOES normalise
its value (`.replace(/\\/g, "/")`, `production-theta-producer.ts:2569-2570`);
the hash input built beside it does not.

## Why it matters

- A whole composition pattern — prompt-mode orchestrator fanning out to
  subagent-mode workers, the documented `/quality-loop` shape — is a naming
  lottery on Windows: a worker is invokable from theta code iff its basename
  sorts before every `.thetalib` it transitively imports. The class is
  Windows-only (POSIX `resolve` emits forward slashes, so both routes spell
  identically there) — which also means no POSIX CI leg can witness it. The incident burnt
  a full triage phase (212/212 refusals, ~4.5 min of pure refusal overhead)
  and, through the theta's own Err fallback, mis-labelled every candidate.
- The refusal wears the tamper/divergence message on a pristine tree, so
  operators triaging REAL mismatches (0312's staleness class) cannot trust
  the one signal the hash contract emits — the exact trust erosion 0330
  documented, now from the content-order leg.
- Each false refusal also spawns work beyond the Err: the refused child does
  not exit after its envelope (the host then processes the argv `-p "/<slug>"`
  as plain prompt text, sanctioned by subagent.md:123), so every refusal
  additionally initiates a spurious model turn in the child, bounded only by
  the teardown kill (see sibling candidate `subagent-callable-hash/02`).

## Non-goals

- The `seen` dedup in `collectCallableClosureSources` (:3606, :3609-3612) is
  keyed by the same raw spelling — a closure member reachable under two
  spellings would be
  hashed twice. Same seam, unprobed; likely unreachable today because only
  the ROOT enters pre-spelled and imports resolve uniformly. Noted for the
  fixer, not claimed.
- Casing variants of the same comparison on case-insensitive filesystems
  (drive letter or directory casing differences between routes) — same seam,
  unprobed; the casing axis of path identity is opened by
  [0361](./0361-case-variant-import-dir-splits-declaring-identity.md)
  and
  [0363](./0363-file-entry-stem-judged-on-entry-spelling.md).
- Bug 0329's enforcement semantics (root drop on any refusal) — correct at
  this pin; untouched.
- The teardown budget noise this incident also surfaced — filed separately
  as candidate `subagent-callable-hash/02`.

## Fix

Options, no pre-decision:

- **(A) True set hash:** hash each member's content to its own sha256, sort
  the per-member digests, hash the sorted list. Path spelling stops mattering
  entirely and the module contract ("the closure is a set") becomes literally
  true. Cost: every marshalled digest changes value (safe — parent and child
  ship in the same installed build and the carrier never crosses versions,
  subagent.md's same-install note); b0328 witness cells that reproduce
  digests via path strings need updating.
- **(B) Canonicalise member paths at collection:** normalise `rootAbs` and
  `importAbs` (`.replace(/\\/g, "/")`) before `seen`/`push` in
  `collectCallableClosureSources` (and/or normalise `absolute` in
  `parseCalleeTheta`). Narrowest diff; makes the digest spelling-insensitive
  while keeping path-order semantics; closes the `seen` spelling sensitivity
  in the same hunk; adopts, for hash identity, the seam 0268's adjudication
  declined for rendering (a concern that never weighed ordering). Must cover
  every route (dispatch parse, discovered-root capture, child fallback,
  child snapshot pass) — normalising inside
  `collectCallableClosureSources` covers all four at one seam.
- **(C) Normalise inside `hashCallableClosure`'s sort key only:** smallest
  possible change, but leaves `ClosureSource.path` spelling-divergent for any
  future reader, leaves the `seen` seam open, and contradicts the repo-wide
  forward-slash convention 0268 pinned; not preferred.

Constraints any fix must satisfy: parent and child MUST compute identical
digests for identical on-disk closure content on every invocation route
(slash, `tools:` call, `invoke(...)` literal, nested child-of-child); the
0329 edit-refuses arm must stay red-able (a REAL edit still refuses); add the
flip/ctrl pair through the real dispatch route (the Reproduction §3 shape) as
a committed witness, since the existing b0328/b0330 cells only cover the
discovered-root spelling. The fix also owes one clarifying sentence at
`subagent.md:94` (same-commit spec edit): the paragraph defines the hash by
CONTENT over a SET and is silent on path spelling as a hash input, while
`:96` already pins "separator-normalized path identity" for the child's
winner-path walk — the sentence pins that the digest is a function of member
content only and invariant under member-path spelling, extending the
existing convention rather than minting one.

## Provenance

Bug-hunt area `subagent-callable-hash` (incident-seeded micro-wave). Seeded
by the coordinator's live incident (both trees, v0.462.0, four model
spellings, both arities); mechanism re-derived independently from source at
c9a1a45a and confirmed offline in both directions plus end-to-end with real
spawned children. Probe file deleted after confirmation.
