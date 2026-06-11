# Triaged Plan Review — plan

_Generated: 2026-06-11T18:05:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T56) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 1 high, 46 medium retained (47 findings); ~88 low discarded; 4 low findings merged into 2 medium findings; ~35 NIT dropped; 14 false dropped (upstream)._

---

# T01 — Coverage-matrix IMPL row conflates owned closers with back-references

**Original heading:** IMPL row — conflates closing leaves with back-references
**Original section:** docs/plan_topics/coverage-matrix.md
**Kind:** clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The `implementation-notes.md` (IMPL) row in `coverage-matrix.md`'s §Code-keyed obligation areas table packs two different kinds of leaf reference into its left "Spec area" cell. It names the IMPL-page-owned closers — the static-resolution parse-cache walk and hot-reload re-walk (`→ V15a, V9b`) and the cross-file `(file, line, col)` aggregation order (`→ V7a`) — and then, in the same cell, a second list introduced by "Pure back-references closed on their owning leaves": multi-error batching `→ V7a` (PIC-21 / DIAG-1), ambient-access ban `→ H3a`, and runtime dependency declarations `→ H1a`. The row's Closing-leaf column, by contrast, lists only `V15a, V9b, V7a`.

Nothing in the matrix states the convention that governs this asymmetry. A reader (or a maintainer reconciling the column against the cell) cannot tell whether the Closing-leaf column is meant to be the row's complete closing set — in which case `H3a` and `H1a` look like omissions to be added — or only the IMPL-page-owned obligations, with the back-references deliberately excluded because they close on their owning rows. The ambiguity is compounded by `V7a`, which appears in the column as a genuine IMPL-owned closer (aggregation order) and again in the back-reference list (multi-error batching), so a maintainer cannot tell whether that column entry is double-counted.

The matrix's opening prose establishes only the general "REQ-ID → implementation leaf that closes it" rule and the code-keyed "closed by the leaf whose green tests assert the listed codes" rule; neither defines what a "pure back-reference" is or whether such references belong in the Closing-leaf column. This row is the sole place the back-reference concept appears, with no governing convention behind it.

## Plan Documents

- `docs/plan_topics/coverage-matrix.md` — §Code-keyed obligation areas (IMPL row + table intro prose) (edited)
- `docs/plan_topics/conventions.md` — §Leaf format `Deps.` bullet (coverage-matrix ownership rule) (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** None

**Leaves (implementation order):**

None — the fix is internal to the cross-cutting `coverage-matrix.md` file. The leaves the row names (`H1a`, `H3a`, `V7a`, `V9b`, `V15a`) are referenced read-only; none of their acceptance criteria, deps, or sequencing change.

## Consequence

**Severity:** correctness

Two reasonable maintainers diverge on whether the Closing-leaf column is complete: one reads `H3a`/`H1a` as missing entries and adds them to the column (over-listing the row's owners), the other treats the column as IMPL-owned-only and leaves it. Because the `H5a` transitive-completeness reconciliation consumes the matrix's closing-leaf assignments, an unstated column convention invites either spurious matrix edits or a mis-reconciled owner set; the divergence is silent because no rule adjudicates it.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 249cec5 — pi-loom plan: resolve "implementation-notes.md (IMPL) unmapped in coverage matrix" (2026-06-11, Thomas Andersen)
**History:** The IMPL `implementation-notes.md` row was added whole-cloth to `coverage-matrix.md` in 249cec5 to resolve an earlier "IMPL unmapped in coverage matrix" finding. That same edit introduced the cell that interleaves the IMPL-owned closers (`V15a`/`V9b`/`V7a`) with the "pure back-references" (`V7a`/`H3a`/`H1a`) while the Closing-leaf column lists only the owned closers — so the conflation has been present since the row's single introducing commit. A pickaxe walk (`git log -S 'Static-resolution load pass'`) shows the row has not been modified since.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/coverage-matrix.md`, add a sentence to the §Code-keyed obligation areas table-intro prose (the paragraph block immediately above the `| Spec area (prefix) | Closing leaf(s) |` table) stating the column-completeness convention: the **Closing-leaf** column enumerates only the leaves that close obligations the row's own spec area owns, and any leaf named in the left cell as a back-reference to an obligation owned by another spec area is closed on that owning row and is intentionally excluded from this column.

With that convention stated, the IMPL row's left cell already reads correctly (it labels the second list "Pure back-references closed on their owning leaves"); no change to the row's column is required. If clearer separation is wanted, the back-reference clause may instead be lifted out of the left cell into an adjacent note under the table — either resolution closes the ambiguity. The implementer should confirm `V7a`'s dual appearance (column closer for aggregation order; back-reference target for multi-error batching) reads unambiguously once the convention is stated.

## Relationships

- T02 "Code-keyed obligation rows have no machine-matchable key, yet three closing-gate arms match cited tokens against them" — same-cluster (both concern how the §Code-keyed obligation areas table's columns are read/matched; resolve independently)

---

# T02 — Code-keyed obligation rows have no machine-matchable key, yet three closing-gate arms match cited tokens against them

**Original heading:** Code-keyed rows carry no machine-matchable key, but three gates match cited tokens against them
**Original section:** docs/plan_topics/coverage-matrix.md
**Kind:** implementability
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

Three distinct closing-gate arms resolve a cited token against the *Code-keyed obligation areas (no numbered REQ-IDs)* table in `coverage-matrix.md`:

- **Sequential by default** (`conventions.md`) — the `no-restricted-syntax` allow-list comment `// allow: <REQ-ID-or-code-keyed-area> — <spec-page>` must cite a token that "resolves … to an enumerated *Code-keyed obligation areas (no numbered REQ-IDs)* entry there."
- **Specific exception types only** (`conventions.md`) — the `// allow-broad-catch: <…> — <spec-page>` comment must cite a token resolving to "an enumerated *Code-keyed obligation areas* entry" (among the four admitted arms).
- **REQ-ID discipline / un-anchored-MUST scan** (`conventions.md`) — a normative MUST/MUST-NOT carrying no `PREFIX-N` REQ-ID and no `loom/...` registry code must be "enumerated in `coverage-matrix.md` under *Code-keyed obligation areas (no numbered REQ-IDs)* with a named closing leaf."

But the table's left column is free prose, not a stable key. Some rows lead with a parenthesised spec-prefix token (`lexical.md` (LEX), `query/` (QRY), `tool-calls.md` (TOOL)); others — the GOV-22 un-anchored-MUST residue rows — carry no token at all, only a page path plus an obligation sentence (e.g. ``pi-integration-contract/conversation-drive.md` — *No additional access channels* denial-surface MUST``). There is no declared rule stating *what substring of the left cell is the match key*, *whether the key is per-row or per-spec-page*, or *how an in-code allow-list token is compared to a row*.

Two good-faith implementers of the `H5a` reconciliation therefore diverge: one keys on the parenthesised prefix (`TOOL`), another on the filename (`tool-calls.md`), another on the full prose cell. Rows sharing a cell (`lexical.md` (LEX), `grammar.md` (GRAM)) and residue rows with no prefix token make the divergence concrete — the same allow-list comment or scanned MUST yields different pass/fail verdicts depending on the unstated match convention.

## Plan Documents

- `docs/plan_topics/coverage-matrix.md` — *Code-keyed obligation areas (no numbered REQ-IDs)* table + its intro (edited)
- `docs/plan_topics/conventions.md` — *Sequential by default*, *Specific exception types only*, *REQ-ID discipline* (un-anchored-MUST scan) (edited)
- `docs/plan_topics/H5a-closing-gate-automation.md` — the three reconciliation Convention bullets + seeded fixtures that implement the token→row match (edited)
- `docs/plan_topics/H2a-cross-cutting-gates.md` — broad-catch lint fixture that references "an enumerated *Code-keyed obligation areas* entry" (read-only)
- Code-keyed-area-citing leaves (`V1a`, `V1b`, `V2c`, `V3a`, `V3d`, `V5c`, `V5d`, `V9g`, `V9i`, `V13b`, `V13c`, `V13d`, `V14a`, `V15a`, and their `-T` partners) — re-tokenised only if a brand-new key form is chosen (option-dependent)

## Spec Documents

None.

## Affected Leaves

**Phases:** Horizontal; Vertical slices (option-dependent)

**Leaves (implementation order):**

- `H5a` — REQ-ID / diagnostic-code closing-gate automation — (modified)
- `H2a` — Cross-cutting lint and architectural gates — (blocked)
- `V1a`, `V1b`, `V2c`, `V3a`, `V3d`, `V5c`, `V5d`, `V9g`, `V9i`, `V13b`, `V13c`, `V13d`, `V14a`, `V15a` — code-keyed-area-citing leaves whose `(<PREFIX> code-keyed area)` citations are re-tokenised only under the new-slug option — (option-dependent)

## Consequence

**Severity:** correctness

The `H5a` closing gate is the mechanical backstop for two allow-list disciplines and the un-anchored-MUST residue. Without a declared match key, two reasonable implementers build the token→row comparison differently (prefix vs filename vs full-prose, per-row vs per-page), producing different pass/fail sets for the same allow-list comment or scanned MUST. A legitimate exemption can redden CI on one implementation and a missing one can pass green on another — the gate's verdict is implementation-defined rather than spec-defined.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen); 0603eb4 — pi-loom plan: resolve "un-anchored normative MUSTs invisible to closing gate" (2026-06-10, Thomas Andersen); 75b6a9b — pi-loom plan: resolve "Sequential by default carve-out admits only a numbered REQ-ID" (2026-06-10, Thomas Andersen); 96563f9 — pi-loom plan: resolve "broad-catch allow-comment predicate unsatisfiable for exempt sites" (2026-06-10, Thomas Andersen)
**History:** The *Code-keyed obligation areas* table entered in c6a664e with a free-prose left column and no machine-matchable key. The defect crystallised as three later commits each wired a closing-gate arm to match against that key-less table: 0603eb4 added the un-anchored-MUST "must be enumerated in the table" arm, 75b6a9b added the *Sequential by default* "resolves to an enumerated Code-keyed obligation areas entry" arm, and 96563f9 added the *Specific exception types only* broad-catch arm. No commit ever supplied the row key the three arms presuppose.

## Solution Space

**Shape:** single

### Recommendation

Formalise the existing per-row parenthesised spec-prefix token as the canonical machine-matchable key. Most rows already lead with a parenthesised token (`LEX`, `GRAM`, `RVM`, `EXPR`, `RET`, `SCHM`, `DESC`, `SUBS`, `FRNT`, `QRY`, `TOOL`, `INV`, `PIC`), and the code-keyed-citing leaves already write `(<PREFIX> code-keyed area)`, so this avoids the cross-leaf re-tokenisation sweep a dedicated new key column would force.

Resolve in this order so the second half lands on a stable baseline: **first** establish the key contract on the matrix — in `coverage-matrix.md`, add a sentence to the *Code-keyed obligation areas* intro defining the parenthesised token as the canonical key, state the per-row granularity (and that the un-anchored-MUST arm matches by spec page/anchor + obligation), and backfill a key token onto every residue row that currently carries only a page-path + obligation sentence; **then** amend the three `conventions.md` rules (*Sequential by default*, *Specific exception types only*, *REQ-ID discipline* un-anchored-MUST scan) to state the cited token / scanned MUST matches against that key, and point the `H5a` reconciliation fixtures at the key.

Edge case the fixer must watch: the residue rows that share the `PIC` prefix (`V9b`/`V9c`/`V9e`/`V9g`/`V9h` obligations) and the multi-page rows (`lexical.md` (LEX), `grammar.md` (GRAM)) — these need a row-local key minted when the bare prefix is not unique, so the un-anchored-MUST arm can resolve to the single closing leaf rather than only to page granularity.

## Relationships

- T01 "Coverage-matrix IMPL row conflates owned closers with back-references" — same-cluster (another ambiguity in the same code-keyed table; resolves independently)
- T53 "V18b audit-methodology obligations have no coverage-matrix closing-leaf row" — decision-overlap (how the new V18b row is keyed depends on whether this finding introduces a stable per-row match key)

---

# T03 — "CI failure" enforcement vocabulary presumes a CI execution surface no leaf provisions

**Original heading:** §Cross-cutting rules — "CI failure" enforcement assumes a CI execution surface no leaf provisions
**Original section:** docs/plan_topics/conventions.md
**Kind:** assumptions
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`conventions.md` expresses its mechanical enforcement throughout in CI terms: a broad-catch allow-list entry resolving to no admissible token "is a CI failure"; a `no-restricted-syntax` allow-list entry resolving to neither a REQ-ID nor a code-keyed area "is a CI failure"; an unmapped executable REQ-ID, a mapped numbered REQ-ID with no citing test, an un-anchored normative MUST with no closing leaf are each "a CI failure". The release-gate leaves extend the same surface — `H5b` runs "without reddening CI", `H6a` "reddens" on a missing mapping, and `H4a`'s smoke gate asserts a change "cannot merge". All of this presupposes an automated CI execution surface that runs the gates on push/PR and blocks merge on red.

No leaf provisions that surface. `H1a` (the scaffold and toolchain leaf) provisions `package.json`, `tsconfig.json`, the lint toolchain, and the `npm test` / `npm run build` scripts; `H2a` wires the lint and architectural gates into `npm test`; `H5a` builds the closing gate run by `npm test`. The gates therefore exist as `npm test` assertions and do fire locally at the per-phase ritual's "Run" step — but nothing creates a CI workflow/runner that invokes `npm test` automatically and gates merges. The corpus contains no `.github/` workflow, no CI configuration file, and no leaf whose **Adds**/**Ships when** provisions one.

The consequence is a vocabulary/provisioning mismatch: the merge-blocking and "fails CI" semantics the conventions and release-gate leaves lean on are not backstopped by any automated surface this plan creates. Either a leaf must own CI provisioning, or the "CI failure" language must be reconciled to the `npm test`-red mechanism that actually exists.

## Plan Documents

- `docs/plan_topics/conventions.md` — Cross-cutting rules ("CI failure" phrasing across *Specific exception types only*, *Sequential by default*, *REQ-ID discipline*, *Doc updates* enforcement-posture note) (edited)
- `docs/plan_topics/H1a-scaffold-and-toolchain.md` — Adds / Tests / Ships when (edited)
- `docs/plan_topics/H2a-cross-cutting-gates.md` — gates wired into `npm test` (read-only)
- `docs/plan_topics/H5a-closing-gate-automation.md` — "The CI gate" Adds (read-only)
- `docs/plan_topics/H5b-warn-only-canary.md` — "without reddening CI" (option-dependent)
- `docs/plan_topics/H6a-live-corpus-activation.md` — release-gate flip / "reddens" (option-dependent)
- `docs/plan_topics/H4a-factory-shell-and-harness.md` — smoke gate "cannot merge" (option-dependent)
- `docs/plan.md` — Release gate / How-to-use references to the gate (read-only)

## Spec Documents

None — CI provisioning is not a spec obligation; `docs/spec.md` and its topics contain no CI/workflow/merge concept. The fix is internal to the plan corpus.

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H1a — Project scaffold and toolchain — (modified)

## Consequence

**Severity:** advisory

The gates are wired into `npm test` and fire at the per-phase ritual's local "Run" step, so leaf content is not ambiguous and no implementer diverges on what to build. What is missing is the automated execution/merge-blocking surface the "CI failure" and "cannot merge" language presumes — so those obligations read as automated enforcement while resting on contributor discipline to run `npm test`.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** 657ee76, c6a664e
**History:** The original plan (`288f191`, "Add implementation plan") provisioned CI explicitly — the scaffold leaf's **Adds** listed "GitHub Actions workflow file" alongside the npm scripts, and a later finding even refined it (`e5ee80f`, "H1 ships a GitHub Actions workflow with no test that it parses or runs the right gates"). The "CI failure" / "fails CI" enforcement vocabulary in `conventions.md` dates from the same early corpus. Commit `657ee76` (2026-05-25, "reset to scaffold + template") deleted the 25 leaf pages including `h1-scaffold.md`, removing the GitHub-Actions-workflow provisioning. The plan rebuild `c6a664e` (2026-06-10, "build/update plan for spec.md + review") re-authored the current `H1a-scaffold-and-toolchain.md` with `package.json`/`tsconfig`/lint-toolchain/`npm test` scripts but did **not** re-introduce any CI-workflow provisioning, while the "CI failure" enforcement vocabulary was carried back into `conventions.md`. The live defect is the joint product of the two commits: the reset dropped the CI-provisioning leaf content, and the rebuild restored the enforcement vocabulary without restoring the surface it assumes. (`git log -S 'GitHub Actions'`, `git log -S 'is a CI failure'`, `git log --diff-filter=A -- '.github/**' '*.yml'` confirm no CI workflow file exists at or after the rebuild.)

## Solution Space

**Shape:** single

### Recommendation

Provision the CI surface in `H1a`. Restore the CI-workflow provisioning the reset dropped: make `H1a` (which already owns the toolchain and the `npm test` / `npm run build` scripts) provision the CI workflow that runs the gate command on push/PR and blocks merge on red.

- `H1a` **Adds.**: add the CI workflow file (e.g. a `.github/workflows/` workflow) that invokes the same `npm test` the gates wire into, to the enumerated scaffold artifacts.
- `H1a` **Tests.**: add a `Convention:` bullet asserting the workflow file exists and invokes `npm test` (so the gates actually run on the CI surface rather than a divergent command).
- `H1a` **Ships when.**: extend so the observable change includes the CI workflow being present and invoking `npm test`.
- `conventions.md`: leave the "CI failure" / "fails CI" phrasing intact — it is now backed by the provisioned surface.

This honours the existing merge-blocker / "fails CI" / "reddens CI" language across `conventions.md`, `H4a`, `H5b`, `H6a` without rewording any of it, and lands on the leaf that already owns the toolchain and previously owned the workflow. The `H1a` test must assert the workflow runs the same `npm test` the gates wire into (not a separate or partial command), or the surface can pass while skipping gates.

## Relationships

- T04 "Gate globs (`src/**` / `**/*.test.ts`) assume a project layout the scaffold never establishes" — same-cluster (both are a gate precondition no scaffold leaf establishes; both naturally land on `H1a`; resolve independently)
- T07 "H5b's coverage-producing `Deps` completeness has no mechanical backstop" — decision-overlap (its "fail CI on omission" remedy presupposes the CI execution surface this finding flags as unprovisioned)

---

# T04 — Gate globs (`src/**` / `**/*.test.ts`) assume a project layout the scaffold never establishes

**Original heading:** §Cross-cutting rules — gates assume a `src/**` / `**/*.test.ts` layout this corpus never establishes
**Original section:** docs/plan_topics/conventions.md
**Kind:** assumptions
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

Every mechanical cross-cutting gate keys off two file-layout globs: production TypeScript lives under `src/**`, and test files are matched by `**/*.test.ts`. The `conventions.md` *Sequential by default* rule defines production code as `src/**` excluding `**/*.test.ts`; the *No globals, statics, singletons* rule scopes its ambient-primitive ban and architectural test to `src/**`; `H2a` wires the `no-restricted-syntax` allow-list and the module-level-mutable-binding architectural test against `src/**` with `**/*.test.ts` unrestricted; `H3a`'s identifier-keyed ambient scan runs over `src/**`; and `V18b`'s surface-closure audit runs over `src/**/*.ts`.

No leaf establishes that layout as an invariant. `H1a` — the scaffold owner — only mentions `src/**` incidentally ("`npm run build` and `npm test` both run green on an empty `src/**` tree"; "zero production source files"), and never states that production sources must live under `src/**` or that test files must carry the `.test.ts` extension. Nothing in the corpus mandates `.test.ts` over `.spec.ts`, and nothing pins the Vitest `include` glob or the `tsconfig` compilation root to the layout the gates assume.

The gap is consequential because the globs are exclusion-sensitive. A test authored as `foo.spec.ts` falls outside `**/*.test.ts`, so the *Sequential by default* rule treats it as production code and bans `Promise.all` in it; the same file under `src/**` is scanned by the architectural test and the ambient-access scan as if it were production. Conversely a production file placed outside `src/**` escapes every gate silently. The closing-gate parity assertions and lint allow-lists all inherit this unstated precondition.

## Plan Documents

- `docs/plan_topics/H1a-scaffold-and-toolchain.md` — Adds / Tests / Ships when (edited)
- `docs/plan_topics/conventions.md` — §Cross-cutting rules (*Sequential by default*, *No globals, statics, singletons*) (edited)
- `docs/plan_topics/H2a-cross-cutting-gates.md` — Adds / Tests (read-only)
- `docs/plan_topics/H3a-di-seam-skeleton.md` — Tests (read-only)
- `docs/plan_topics/V18b-inventory-audit.md` — Adds / Tests (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal; Vertical (V18 slice)

**Leaves (implementation order):**

- H1a — Project scaffold and toolchain — (modified)

Gate-consuming leaves whose mechanical surface rests on the layout invariant but whose text does not change under the fix: `H2a` (architectural test, `no-restricted-syntax`, `no-broad-catch`), `H3a` (ambient-access scan), `V18b` (surface-closure audit). They are read-only same-cluster consumers, not edited by this fix.

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one names test files `*.test.ts` and lands under the gates as intended, another names them `*.spec.ts` (or places production outside `src/**`) and the gate semantics invert — the `.spec.ts` test is treated as production (its `Promise.all` reddens lint, its module-level bindings are scanned), and out-of-`src` production escapes the architectural, ambient, and audit gates entirely. The mismatch surfaces as spurious lint failures or, worse, as silently unenforced cross-cutting rules.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** The cited gate rules referenced `src/**` (2 occurrences) and `**/*.test.ts` in `conventions.md` in the corpus's first commit (c6a664e), and `H1a` referenced `src/**` once in the same commit without ever mentioning `.test.ts`, the test-file extension, or a layout precondition. A pickaxe walk (`git log -S '*.test.ts' -- H1a-scaffold-and-toolchain.md`) finds no later commit adding a layout-establishing statement to `H1a`. The defect — gates depending on a layout that no leaf establishes as an invariant — has been present since inception.

## Solution Space

**Shape:** single

### Recommendation

In `H1a`, state the production/test file layout as a scaffold-established invariant and back it with the scaffold's own config: production TypeScript sources live under `src/**`, and test files are named `*.test.ts` (matched by the `**/*.test.ts` glob the gates exclude). Pin this in the scaffold artefacts `H1a` already owns — the `tsconfig.json` compilation root and the Vitest `include` glob (`**/*.test.ts`) — and add an `H1a` Tests bullet that asserts the invariant mechanically against `package.json`/`tsconfig.json`/the Vitest config, so a layout-config drift fails `H1a`'s own `npm test` rather than going undetected until a downstream gate misfires. Extend `H1a`'s **Ships when** to name the layout invariant alongside the existing green-build condition.

In `conventions.md`, where the *Sequential by default* and *No globals, statics, singletons* rules first use the `src/**` / `**/*.test.ts` globs, cross-reference `H1a` as the owner of the layout invariant the globs rely on, so the gate rules rest on a stated precondition rather than an implicit one.

Edge cases the implementer must watch: the Vitest `include` glob, the `no-restricted-syntax` exclusion, the `H2a` architectural-test scope, the `H3a` ambient-scan scope, and the `V18b` audit scope must all use the same `src/**` production / `**/*.test.ts` test partition — a glob mismatch between any two reopens the gap for the files in the difference.

## Relationships

- T03 "\"CI failure\" enforcement vocabulary presumes a CI execution surface no leaf provisions" — same-cluster (sibling gate-precondition-never-provisioned gap in the same cross-cutting ruleset; both land on `H1a`; resolve independently)
- T05 "Ambient-primitive ban omits `fs`/watch while the seam inventory presupposes their isolation" — same-cluster (another `src/**`-scoped ambient-discipline assumption gap)

---

# T05 — Ambient-primitive ban omits `fs`/watch while the seam inventory presupposes their isolation

**Original heading:** §Cross-cutting rules → No globals — ambient-primitive ban assumes its 5-entry enumeration is complete; FileSystem/FileWatcher seam isolation not stated
**Original section:** docs/plan_topics/conventions.md
**Kind:** assumptions
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The *No globals, statics, singletons* cross-cutting rule in `conventions.md` bans direct ambient-primitive access and enumerates exactly five primitives as the governed set: `process.env`, `process.cwd`, `crypto.randomUUID`, `Date.now`, and `setTimeout`. The identifier-keyed architectural scan declared in `H3a` flags direct references to those five and nothing else, and `V8b`'s `PIC-13` test asserts only that no `src/**` module reads `process.env`/`process.cwd` directly.

But the same seam inventory (`H3a` `Adds.`, `V8b`) introduces a `FileSystem` seam (`readText`/`readBytes`/`writeText`/`exists`/`homedir`/`cwd`/`readdir`/`lstat`/`realpath`) and a `FileWatcher` seam (`watch`). These seams exist precisely so filesystem and watch access is injected per-runtime rather than reached ambiently — yet nothing in the ban surface forbids a `src/**` module from `import`-ing `node:fs` (or `fs.watch`) and calling it directly. Filesystem access is import-based, not global-property access, so it is structurally outside the identifier-keyed ambient scan; and the prose ban surface never names `fs`/watch at all. The result is an unstated assumption: the seam inventory presupposes that direct `fs`/watch access in `src/**` is forbidden, but neither the rule text nor any gate says so.

An implementer reading the convention literally sees a closed five-entry list and could reasonably `import fs from 'node:fs'` for a direct read, bypassing the `FileSystem` seam, breaking per-runtime DI isolation, and leaving the seam partially or wholly unused — with no mechanical or prose backstop flagging it.

## Plan Documents

- `docs/plan_topics/conventions.md` — §Cross-cutting rules → *No globals, statics, singletons* (edited)
- `docs/plan_topics/H3a-di-seam-skeleton.md` — `Adds.` / `Tests.` ambient-access scan (option-dependent)
- `docs/plan_topics/V8b-clock-fs-id-watch-token-seams.md` — `PIC-13` Tests bullet (option-dependent)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal, Vertical V8

**Leaves (implementation order):**

- H3a — Dependency-injection seam skeleton — (modified)
- V8b — `Clock`, `FileSystem`, `IdSource`, `FileWatcher`, `TokenEstimator` seams — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one routes all filesystem/watch access through the injected `FileSystem`/`FileWatcher` seams (the architecture's intent); the other imports `node:fs` directly, which no gate or rule forbids. The second path defeats per-runtime DI isolation, leaves the seam contract un-exercised, and ships an un-injected ambient I/O collaborator the plan's *No globals* discipline was meant to prevent.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** The plan rebuild c6a664e authored the `H3a` seam skeleton and the `V8b` seam leaf — introducing the `FileSystem` and `FileWatcher` host seams — together with the ambient-primitive ban enumerating only `process.env`, `process.cwd`, `crypto.randomUUID`, `Date.now`, and `setTimeout` (then carried in `H3a`'s `Tests.`). The ban omitted `fs`/watch from the start, so the seam inventory presupposed an fs-isolation discipline the ban surface never expressed. A later commit (49379da, 2026-06-11) relocated and elaborated the ban into `conventions.md` but carried the same five-primitive surface forward, preserving the gap.

## Solution Space

**Shape:** single

### Recommendation

Scope the ambient-primitive ban to the five named primitives and assign `fs`/watch isolation to the seam contract. Explicitly state that the identifier-keyed ambient scan governs exactly the five named global primitives, and that filesystem/watch isolation is owned by the `FileSystem`/`FileWatcher` seam contract as ordinary DI discipline (collaborators passed by constructor), with the residue — a direct `node:fs`/watch import in `src/**` outside the seam adapters — owned by the *Per-phase TDD ritual* self-review step, mirroring how the rule already routes the indirect-ambient and undetected-singleton residue to that named manual gate.

- `conventions.md` §*No globals*: add a sentence scoping the identifier-keyed ambient scan to the five named primitives and stating that `fs`/watch access is a constructor-injected collaborator owned by the `FileSystem`/`FileWatcher` seams, with direct `src/**` imports of `node:fs`/watch outside those adapters caught at the self-review step. Extend the self-review checklist bullet (already covering indirect ambient reads) to ask whether any direct `fs`/watch import reaches `src/**` outside the seam adapters.

This is consistent with the plan's existing "mechanical scans witness only what their keying detects; the residue is owned by a named manual gate" framing, adds no new mechanical gate, and no new false-positive surface. Edge case the implementer must watch: the seam adapter modules authored by `V8b` are themselves the legitimate `fs`/watch import sites, so the self-review wording must exempt the adapter modules the same way the ambient allow-list exempts the seam adapters.

## Relationships

- T04 "Gate globs (`src/**` / `**/*.test.ts`) assume a project layout the scaffold never establishes" — same-cluster (touches the same scan's `src/**` scope; resolves independently)

---

# T06 — H6a Deps-note parenthetical restates the coverage-producing set as `(H5a, M, V1a–V18d)`, omitting the coverage-producing leaf H1a

**Original heading:** H6a parenthetical restates a stale coverage-producing set excluding H1a
**Original section:** docs/plan_topics/conventions.md (H5b / H6a — Canary and live-corpus activation)
**Kind:** doc-alignment-broad
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H6a`'s **Deps.** note states that `H5b` "owns the complete coverage-producing dependency set (`H5a`, `M`, `V1a`–`V18d`)". That parenthetical enumeration omits `H1a`. Per [`coverage-matrix.md`](../../docs/plan_topics/coverage-matrix.md) §Code-keyed obligation areas, `H1a` is the named closing leaf for the un-anchored MUST-NOT obligation in `pi-integration-contract/host-prerequisites.md` §`pi-sdk-pin` (the `typebox "*"` "MUST NOT be collapsed into the four-entry tilde-pinned `peerDependencies` group" rule), so `H1a` is a coverage-producing leaf. `conventions.md` §REQ-ID discipline (*Transitive-completeness plan-maintenance*) defines the coverage-producing set as every leaf that can introduce an executable REQ-ID, a citing test closing a mapped numbered REQ-ID, or an un-anchored normative MUST — with no carve-out exempting horizontal leaves.

The note frames the set as "every MVP and vertical implementation leaf (`V1a`–`V18d`)" plus `H5a` and `M`, a framing that structurally excludes horizontal leaves and therefore drops `H1a`. The parenthetical claims to be the *complete* set, which makes the omission a false completeness assertion rather than an abbreviation.

This is a distinct surface from the same omission in `H5b`'s own Deps note: `H6a` carries its own restatement of the set even though its prose says it "inherits that completeness transitively through `H5b` rather than restating the set". Correcting `H5b`'s Deps does not touch this parenthetical — it remains stale independently and must be corrected here as well.

## Plan Documents

- `docs/plan_topics/H6a-live-corpus-activation.md` — Deps note parenthetical (edited)
- `docs/plan_topics/H5b-warn-only-canary.md` — Deps / Deps note (read-only)
- `docs/plan_topics/coverage-matrix.md` — §Code-keyed obligation areas, `host-prerequisites.md` §`pi-sdk-pin` row naming `H1a` (read-only)
- `docs/plan_topics/conventions.md` — §REQ-ID discipline, Transitive-completeness plan-maintenance (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal (Release-gate sub-grouping)

**Leaves (implementation order):**

- H6a — Live-corpus closing-gate activation (loom 1.0 release gate) — (modified)

## Consequence

**Severity:** correctness

The note asserts a *complete* coverage-producing set that silently excludes a coverage-producing leaf (`H1a`), so a maintainer auditing the transitive-completeness obligation against this restatement would conclude the set is complete when it is not. The stale parenthetical does not by itself misroute `H6a`'s operative Deps (`H5b, H7a`), but it propagates the same incorrect set as `H5b` and erodes the in-corpus record that the warn-only and hard-fail footings cover an identical leaf set.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** 5353dd7 — pi-loom plan: resolve "Release-gate activation has no owning leaf" (2026-06-10, Thomas Andersen); 83c25b9 — pi-loom plan: resolve "typebox MUST NOT be collapsed obligation in H1a" (2026-06-10, Thomas Andersen)
**History:** 5353dd7 created `H6a` with a Deps-note set listing of `(H5a, M, V1a–V18c)` framed as "every MVP and vertical implementation leaf" — correct at that moment, since no horizontal leaf was yet coverage-producing. About two hours later 83c25b9 added the `typebox "*"` un-anchored MUST-NOT row to `coverage-matrix.md` naming `H1a` as its closing leaf, making `H1a` coverage-producing without propagating it into `H6a`'s (or `H5b`'s) set restatement. The later range refresh to `V1a–V18d` (8af3204) carried the omission forward. The defect is the interaction: a coverage-producing horizontal leaf was introduced while the completeness restatements only ever enumerated MVP + vertical leaves.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/H6a-live-corpus-activation.md`, the Deps note (the italic parenthetical following **Deps.**) currently reads ``H5b` owns the complete coverage-producing dependency set (`H5a`, `M`, `V1a`–`V18d`)``. Add `H1a` to that listing so it reads ``(`H1a`, `H5a`, `M`, `V1a`–`V18d`)``, matching the corrected `H5b` set. Do not alter `H6a`'s operative **Deps.** line (`H5b, H7a`) — only the prose restatement of the set is wrong; `H6a` continues to inherit completeness transitively through `H5b`.

The fix is internal to the plan corpus: the spec (`host-prerequisites.md` and the rest of `spec_topics/**`) is read-only for this change, and `coverage-matrix.md` / `conventions.md` are read-only context — no edit to them is required here. Keep the listed IDs in the existing `H<n><letter>` / `V<n><letter>` scheme; introduce no new IDs.

## Relationships

- T08 "H1a missing from H5b's Deps, and the completeness claim that scopes the coverage-producing set to MVP/vertical leaves only" — must-follow (that finding establishes `H1a` as coverage-producing and corrects `H5b`'s Deps + Deps note; this fix applies the same `H1a` inclusion to `H6a`'s separate parenthetical restatement and must agree with it)

---

# T07 — H5b's coverage-producing `Deps` completeness has no mechanical backstop

**Original heading:** §REQ-ID discipline / Release gate — completeness of H5b Deps gated only by manual maintenance
**Original section:** docs/plan_topics/conventions.md
**Kind:** risk
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

The loom 1.0 release-gate design routes the entire "is coverage complete?" sequencing guarantee through one leaf's dependency list. [`H5b`](docs/plan_topics/H5b-warn-only-canary.md)'s `Deps.` is declared to be "the complete coverage-producing set", and [`H6a`](docs/plan_topics/H6a-live-corpus-activation.md) inherits that set transitively by depending on `H5b` rather than restating it, so the warn-only canary and the hard-fail flip are both sequenced after every leaf that can introduce an executable REQ-ID, a closing citing-test, or an un-anchored normative MUST. Keeping that set complete is stated as a standing manual obligation — the *Transitive-completeness plan-maintenance* rule in [`conventions.md`](docs/plan_topics/conventions.md) *REQ-ID discipline*: whenever a coverage-producing leaf is added, the author "MUST" add it to `H5b`'s `Deps.`.

Nothing mechanically verifies that obligation was honoured. The [`H5a`](docs/plan_topics/H5a-closing-gate-automation.md) closing gate reconciles spec REQ-IDs, the coverage matrix, the diagnostics registry, citing tests, un-anchored MUSTs, the broad-catch allow-list, retired/live clashes, and per-prefix numbering holes — but it has no arm that compares the set of closing leaves named in [`coverage-matrix.md`](docs/plan_topics/coverage-matrix.md) against the transitive membership of `H5b`'s `Deps.`. An author who adds a coverage-producing leaf and forgets the `H5b` `Deps.` edit triggers no failure.

This is not hypothetical. `coverage-matrix.md`'s *Code-keyed obligation areas* table names `H1a` as the closing leaf for the `host-prerequisites.md` §`pi-sdk-pin` `typebox "*"` MUST-NOT, yet `H5b`'s `Deps.` enumerates only `H5a, M, V1a–V18d` — the horizontal closing leaf `H1a` is absent. The manual obligation has already drifted, and the gate is silent about it.

## Plan Documents

- `docs/plan_topics/H5a-closing-gate-automation.md` — Adds / Tests (edited)
- `docs/plan_topics/H5b-warn-only-canary.md` — Deps (read-only)
- `docs/plan_topics/coverage-matrix.md` — Numbered REQ-IDs + Code-keyed obligation-areas closing-leaf columns (read-only)
- `docs/plan_topics/conventions.md` — REQ-ID discipline, *Transitive-completeness plan-maintenance* (option-dependent)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- `H5a` — REQ-ID / diagnostic-code closing-gate automation — (modified)
- `H5b` — Warn-only live-corpus canary — (modified)

## Consequence

**Severity:** advisory

A coverage-producing leaf omitted from `H5b`'s `Deps.` lets `H6a` be sequenced and activated before that leaf lands. For numbered REQ-IDs the live-corpus citing-test arm reddens `main` (visible but disruptive), but an un-anchored MUST whose closing leaf is omitted passes green — the gate only checks that the coverage matrix enumerates a closing leaf, not that the leaf has landed — so the release gate can certify "complete coverage" while a closing leaf is still outstanding. The `H1a` omission already present in the corpus shows the manual obligation drifts in practice.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** ea6b1da — pi-loom plan: resolve "Live-corpus gate activation has no documented rollback" (2026-06-11, Thomas Andersen); 37733fd — pi-loom plan: resolve "H6a transitive-completeness rule parked in Deps, not conventions" (2026-06-11, Thomas Andersen); ab8e297 — pi-loom plan: resolve "Transitive-completeness obligation invisible at leaf authoring" (2026-06-11, Thomas Andersen)
**History:** `H5b`'s first commit (ea6b1da) already defined its `Deps.` as the manually-maintained "complete coverage-producing set" with no mechanical completeness check, so the gap is present since the leaf's inception. Commit 37733fd then codified the manual obligation into `conventions.md` as the *Transitive-completeness plan-maintenance* rule (lifting it out of Deps-only prose), and ab8e297 made the obligation visible at leaf-authoring time; both restated the manual rule without ever adding a mechanical assertion to back it.

## Solution Space

**Shape:** single

### Recommendation

Add a new closing-gate arm to [`H5a`](docs/plan_topics/H5a-closing-gate-automation.md) (the leaf that owns the gate machinery) that reconciles the set of closing leaves named in [`coverage-matrix.md`](docs/plan_topics/coverage-matrix.md) against the transitive membership of [`H5b`](docs/plan_topics/H5b-warn-only-canary.md)'s `Deps.`, and fails CI when any coverage-matrix closing leaf is not transitively reachable from that `Deps.` set.

Concretely:
- In `H5a`'s `Adds.`, extend the reconciliation surface so the gate, for every closing-leaf cell in `coverage-matrix.md`'s *Numbered REQ-IDs* table and its *Code-keyed obligation areas* table, requires that leaf ID to be a member of `H5b`'s `Deps.` after expanding both sides' contiguous ranges (e.g. `V1a–V18d`) and `H5b`'s named singletons (`H5a`, `M`). A closing leaf absent from that expanded set is a CI failure.
- Add a corresponding `Convention:` Tests bullet on `H5a` exercising it against the seeded fixtures on the same seeded-fixture-then-live footing as the existing arms: a seeded coverage-matrix row naming a closing leaf absent from a seeded `H5b`-`Deps.` fixture reddens, and a fixture where every closing leaf is present passes.
- Run this arm as a standing plan-structural check (like the per-prefix numbering-hole arm) — it reads only plan files, which are always present — rather than deferring it to the `H6a` live-corpus flip, so the omission is caught before activation.
- In `conventions.md` *Transitive-completeness plan-maintenance*, note that the obligation is now mechanically backed by this `H5a` gate arm so the rule and the gate stay in lockstep.

Edge cases the implementer must handle: contiguous-range expansion on both the coverage-matrix and `H5b`-`Deps.` sides; the `<new>` placeholder rows in the code-keyed table (no real leaf yet — exclude them); and the *IMPL* row's pure back-references ("ambient-access ban → `H3a`", "runtime dependency declarations → `H1a`"), which are not closing-leaf cells and must not be read as coverage obligations.

## Relationships

- T08 "H1a missing from H5b's Deps, and the completeness claim that scopes the coverage-producing set to MVP/vertical leaves only" — must-follow (concrete instance this gate arm would catch; that fix must land for this check to pass green, so address it first)
- T03 "\"CI failure\" enforcement vocabulary presumes a CI execution surface no leaf provisions" — decision-overlap (this arm's "fail CI on omission" remedy presupposes the CI surface that finding flags as unprovisioned)

---

# T08 — H1a missing from H5b's Deps, and the completeness claim that scopes the coverage-producing set to MVP/vertical leaves only

**Original heading:** H1a absent from H5b's Deps despite being a coverage-producing leaf; completeness claim excludes horizontal leaves
**Original section:** docs/plan_topics/conventions.md (H5b / H6a — Canary and live-corpus activation)
**Kind:** doc-alignment-broad
**Importance:** high
**Score:** 90
**MustFix:** false

## Finding

`coverage-matrix.md` lists `H1a` as the closing leaf for the un-anchored `typebox "*"` MUST-NOT obligation (`pi-integration-contract/host-prerequisites.md` §`pi-sdk-pin` — "`typebox` `"*"` MUST NOT be collapsed into the four-entry tilde-pinned `peerDependencies` group"). That obligation is one of the three closing-gate surfaces the canary reconciles, so `H1a` is a coverage-producing leaf in the precise sense `conventions.md` §REQ-ID discipline uses.

The *Transitive-completeness plan-maintenance* clause in `conventions.md` is unconditional: any leaf that can introduce an executable REQ-ID, a citing test that closes a coverage-matrix-mapped numbered REQ-ID, or an un-anchored normative MUST "MUST be added to `H5b`'s `Deps.`". It grants no horizontal-leaf exception. `H1a` closes an un-anchored normative MUST-NOT, yet it is absent from `H5b`'s `Deps` (which begins `H5a, M, V1a–V1b, …`).

The omission is reinforced by `H5b`'s coverage-producing-set parenthetical, which frames completeness as "every MVP and vertical implementation leaf (`V1a`–`V18d`)". That framing scopes the set to MVP and vertical leaves only and silently excludes the horizontal closing leaf `H1a` (and is itself the wrong frame for the rule, which is keyed on coverage production, not phase). The parenthetical therefore asserts the set is "the complete coverage-producing set" while it is not. The same stale framing recurs in `H6a`'s parenthetical (which restates the set as "`H5a`, `M`, `V1a`–`V18d`"), tracked as a separate finding.

## Plan Documents

- `docs/plan_topics/H5b-warn-only-canary.md` — Deps field + coverage-producing-set parenthetical (edited)
- `docs/plan_topics/H6a-live-corpus-activation.md` — coverage-producing-set parenthetical (option-dependent — same omission, resolved by its own finding)
- `docs/plan_topics/conventions.md` — §REQ-ID discipline, *Transitive-completeness plan-maintenance* (read-only)
- `docs/plan_topics/coverage-matrix.md` — Code-keyed obligation areas, `typebox "*"` row naming `H1a` (read-only)
- `docs/plan.md` — Release gate section ("The canary's Deps name the complete coverage-producing set") (read-only)

## Spec Documents

None. The `typebox "*"` MUST-NOT already exists in `pi-integration-contract/host-prerequisites.md` §`pi-sdk-pin`; the fix is internal to the plan files.

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- `H5b` — Warn-only live-corpus canary — (modified — `H1a` added to Deps; parenthetical revised)
- `H6a` — Live-corpus closing-gate activation — (modified — parenthetical restates the same set excluding `H1a`; co-resolves via its own finding)

## Consequence

**Severity:** correctness

The plan contradicts its own *Transitive-completeness plan-maintenance* rule and presents `H5b`'s `Deps` as "the complete coverage-producing set" when it omits `H1a`. The "every MVP and vertical implementation leaf" framing entrenches a phase-based exclusion the rule never grants, so a future horizontal coverage-producing leaf would be omitted by the same precedent; and the mechanical matrix↔Deps reconciliation proposed in a sibling finding would redden on `H1a`'s absence. (The live gate does not actually misfire today, because `H1a` is the root leaf with `Deps: -` and is always built first — but the documented invariant and completeness claim are wrong.)

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** 83c25b9 — pi-loom plan: resolve "typebox MUST NOT be collapsed obligation in H1a" (2026-06-10, Thomas Andersen); ea6b1da — pi-loom plan: resolve "Live-corpus gate activation has no documented rollback" (2026-06-11, Thomas Andersen)
**History:** `83c25b9` added the `typebox "*"` MUST-NOT row to `coverage-matrix.md` naming `H1a` as its closing leaf, making `H1a` a coverage-producing leaf. The next day `ea6b1da` created `H5b-warn-only-canary.md`, and its first commit already carried the completeness parenthetical scoping the coverage-producing set to "every MVP and vertical implementation leaf (`V1a`–`V18c`)", excluding the already-coverage-producing `H1a`. The defect is the divergence between the producer commit and the later consumer-leaf authoring.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/H5b-warn-only-canary.md`:

- Add `H1a` to the **Deps.** field. `H1a` closes the un-anchored `typebox "*"` MUST-NOT obligation per `coverage-matrix.md`, so the *Transitive-completeness plan-maintenance* clause requires its presence. Add it as a discrete leading entry (e.g. alongside `H5a`); do not fold it into a `V…` range — the Deps list keeps horizontal and `V`-range entries distinct.
- Revise the coverage-producing-set parenthetical so its completeness claim is keyed on coverage production rather than phase: the set is the closing-leaf set named in `coverage-matrix.md`, which includes the horizontal leaf `H1a` (its `typebox "*"` MUST-NOT closure) and `H5a`, not only MVP and vertical leaves. Drop the "every MVP and vertical implementation leaf (`V1a`–`V18d`)" framing as the sole basis for completeness.

Do **not** add `H7a` to `H5b`'s Deps: `H7a` closes no new spec REQ-ID and is pinned directly on `H6a`, by design. The matching parenthetical correction in `H6a` (set restated as "`H5a`, `M`, `V1a`–`V18d`") is owned by its own finding and must land in agreement with this edit.

## Relationships

- T06 "H6a Deps-note parenthetical restates the coverage-producing set as `(H5a, M, V1a–V18d)`, omitting the coverage-producing leaf H1a" — must-precede (this fix establishes `H1a` as coverage-producing; the H6a parenthetical correction must agree with — and follows — it)
- T07 "H5b's coverage-producing `Deps` completeness has no mechanical backstop" — must-precede (its proposed mechanical matrix↔Deps reconciliation would redden on `H1a`'s absence; this fix must land for that check to pass)

---

# T09 — H4a's real-host smoke gate consumes H7a-owned artifacts without a resolvable dependency

**Original heading:** Smoke gate references artifacts only H7a produces, with a silent dependency
**Original section:** H4a — Extension factory shell and end-to-end harness
**Kind:** ordering
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H4a`'s third Tests bullet defines a **manual real-host smoke run** that drives `H7a`'s committed multi-feature fixture `.loom` against a live Pi host, and its pass criterion (e) scores the emitted `loom-system-note` codes against `H7a`'s committed **permitted-code list**. Both artifacts are owned and produced by `H7a` (its Tests bullets check them in alongside the fixture `.loom`). `H4a` declares only `Deps. H3a`, and the smoke is specified as a **required pre-merge gate** on two independent triggers: (1) every Pi version bump, and (2) any merge whose diff touches the four fidelity-contract axes. Neither trigger is qualified by "once `H7a` lands".

The dependency is therefore silent and, in the build order, premature. `H7a` depends on `H4a` (and on six deep V-leaves), so `H7a`'s fixture `.loom` and permitted-code list do not exist until late in the build — long after `H4a` ships. A Pi version bump or a fidelity-axis-touching merge that occurs before `H7a` lands fires a smoke trigger whose fixture and reference code-list do not yet exist, so the gate as written cannot execute. The dependency cannot be closed by adding `H7a` to `H4a`'s `Deps` either — that would create a cycle (`H7a` already depends on `H4a`).

`H6a`'s release-gate note already pins the `H7a` edge (`H6a` Deps `H5b, H7a`) so the fixture exists before the *release-gate evidence record* references it. That pin covers only `H6a`'s reference; it does not cover `H4a`'s two standalone triggers, which can fire at any point in the project's life independent of the release gate.

## Plan Documents

- `docs/plan_topics/H4a-factory-shell-and-harness.md` — Tests (real-host smoke-gate bullet, pass criterion (e), trigger model) (edited)
- `docs/plan_topics/H7a-integration-acceptance.md` — Adds / Tests / Deps (fixture `.loom`, permitted-code-list ownership) (option-dependent)
- `docs/plan_topics/H6a-live-corpus-activation.md` — Release-gate acceptance (manual real-host smoke) note (read-only)
- `docs/plan_topics/V18d-version-bump-acceptance.md` — double-backed runtime-evidence backstop / revert path (read-only)

## Spec Documents

None — the fix is internal to the plan's leaf files.

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H4a — Extension factory shell and end-to-end harness — (modified)

## Consequence

**Severity:** correctness

A smoke trigger that fires before `H7a` lands — most plausibly a Pi version bump early in the build — points at a fixture `.loom` and permitted-code list that do not yet exist, so the required pre-merge gate cannot run as specified. Two implementers facing a pre-`H7a` bump would diverge: one synthesises an ad-hoc fixture, another skips the smoke entirely (treating it as inert), and a third treats `V18d`'s double-backed run as a substitute. The plan gives no defined answer, and the merge-blocker semantics rest on a gate that may have no executable fixture.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** e7f14dd — pi-loom plan: resolve "Real-host fidelity of the session double has no reproducible detection point" (2026-06-11, Thomas Andersen); 052b019 — pi-loom plan: resolve "Real-host smoke pass criterion (e) names a permitted code set with no committed source" (2026-06-11, Thomas Andersen)
**History:** H4a's `Deps. H3a` has been unchanged since the plan's first commit (c6a664e, 2026-06-10). H7a was created at e7e51cc (2026-06-10). The cross-leaf coupling entered at e7f14dd, which added H4a's manual real-host smoke run driving H7a's committed fixture `.loom` without a Deps edge or a trigger qualification; commit 052b019 later deepened the silent dependency by adding pass criterion (e), which consumes H7a's committed permitted-code list. The defect was already present after e7f14dd alone, so the verdict is single-commit with 052b019 widening it.

## Solution Space

**Shape:** single

### Recommendation

Qualify the `H4a` smoke-gate bullet so the smoke's first executable trigger is contingent on `H7a`'s committed fixture `.loom` and permitted-code list existing: the smoke gate is not yet runnable until `H7a` lands, and a trigger (Pi version bump or fidelity-axis-touching merge) that fires before `H7a` defers its real-host-smoke obligation, with `V18d`'s double-backed runtime-evidence gate as the only pre-`H7a` backstop.

Add a qualifying clause to the `H4a` smoke-gate Tests bullet (the bullet that names "`H7a`'s committed multi-feature fixture `.loom`" and pass criterion (e)) recording the contingency on `H7a`'s fixture + permitted-code list, and that triggers firing before `H7a` lands have no executable smoke and fall back to `V18d`'s double-backed gate. This is the scope-bounding fix — it touches only `H4a`, makes no Deps-graph change, and cannot introduce the cycle a literal "add `H7a` to Deps" would create. Edge case the implementer must watch: reconcile the contingency clause with trigger (1) — a Pi version bump that occurs before `H7a` lands must have a defined disposition (deferred, or covered by `V18d` alone).

## Relationships

None

---

# T10 — TYPE-9 test bullet names a prose category instead of the ternary/array diagnostic codes

**Original heading:** TYPE-9 third per-site "code" is a prose category, not a diagnostic code
**Original section:** V2b — Type-compat engine
**Kind:** clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V2b`'s TYPE-9 Tests bullet reads: `per-site codes (let-rhs-type-mismatch, fn-arg-type-mismatch, ternary/array common-type) fire on static mismatch`. The first two entries are real diagnostic codes; the third, `ternary/array common-type`, is a prose category, not a diagnostic code. An implementer cannot tell which code(s) a ternary or array site is required to emit on a static mismatch.

The spec is unambiguous on this. `spec_topics/type-system.md` §TYPE-9 routes ternary failures through the array-and-ternary common-type machinery: `loom/parse/array-element-type-mismatch` when a branch fails against an in-scope sink, and `loom/parse/array-no-common-type` when no sink narrows two branches that share no common type (both codes are registered in `spec_topics/diagnostics/code-registry-parse.md` and elaborated in `spec_topics/expressions.md`). The TYPE-9 test bullet replaces these two concrete codes with a category label, so the gate cannot pin the spec-mandated emission. Separately, the two named codes (`let-rhs-type-mismatch`, `fn-arg-type-mismatch`) are written without the `loom/parse/` namespace prefix that the registry uses, so the bullet mixes bare and would-be-bare code names against the fully-qualified registry entries.

The identical bullet appears verbatim in the paired tests leaf `V2b-T`, so the ambiguity is present on the leaf that lands first.

## Plan Documents

- `docs/plan_topics/V2b-type-compat-engine.md` — Tests, TYPE-9 bullet (edited)
- `docs/plan_topics/V2b-T-type-compat-engine.md` — Tests, TYPE-9 bullet (edited)
- `docs/plan_topics/V2a-type-grammar.md` — `loom/parse/array-no-common-type` ownership (read-only)
- `docs/plan_topics/coverage-matrix.md` — `TYPE-1 … TYPE-10 → V2b` mapping (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slices (V2)

**Leaves (implementation order):**

- V2b-T — Type-compatibility engine (`⊑`) (tests) — (modified)
- V2b — Type-compatibility engine (`⊑`) — (modified)

## Consequence

**Severity:** correctness

The TYPE-9 test bullet's third entry is a category rather than a code, so two reasonable implementers diverge: one invents a single `common-type`-style code, another emits the spec's `loom/parse/array-element-type-mismatch` / `loom/parse/array-no-common-type`. A test asserting an invented code passes against an implementation that emits the spec's codes only by coincidence, so the gate fails to pin the spec-mandated ternary/array emission.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e (2026-06-10, "pi-loom plan: build/update plan for spec.md + review")
**History:** The TYPE-9 bullet entered both `V2b-type-compat-engine.md` and `V2b-T-type-compat-engine.md` at the initial plan-build commit `c6a664e` with `ternary/array common-type` already in place; `git log -S 'ternary/array common-type'` and `git log -G 'TYPE-9'` on both files return only `c6a664e`, so the token is unchanged since inception. The one later commit touching `V2b` (`210ed9b`, the ship-gate / AJV-seam fix) did not alter the TYPE-9 line.

## Solution Space

**Shape:** single

### Recommendation

In both `docs/plan_topics/V2b-type-compat-engine.md` and `docs/plan_topics/V2b-T-type-compat-engine.md`, rewrite the TYPE-9 Tests bullet so the third "per-site code" is replaced by the two literal codes the spec assigns to the ternary/array sites, and so all named codes carry the `loom/parse/` prefix used by the code registry.

- Strike `ternary/array common-type` and name, per `type-system.md` §TYPE-9: `loom/parse/array-element-type-mismatch` (a ternary branch fails against an in-scope sink) and `loom/parse/array-no-common-type` (no sink narrows two branches sharing no common type).
- Prefix the existing two codes to `loom/parse/let-rhs-type-mismatch` and `loom/parse/fn-arg-type-mismatch` so the bullet matches the registry's fully-qualified form.
- Keep the `V2b` and `V2b-T` bullets identical to each other (the tests leaf must assert exactly what the implementation emits).

Edge case for the implementer: `loom/parse/array-no-common-type` (and the empty-array case) is closed by `V2a`, and `coverage-matrix.md` maps the array/grammar code-keyed area to `V1a`/`V1b`/`V2a`. The ternary path in `V2b` reuses these existing codes rather than introducing new ones — naming them in the TYPE-9 bullet is a co-assertion of `V2a`-owned codes from the ternary site, not a new closing obligation, so no coverage-matrix mapping changes.

## Relationships

None

---

# T11 — NOCEIL-3 uncatchable carve-out is asserted as an undrivable Tests bullet

**Original heading:** NOCEIL-3 uncatchable carve-out "emits no diagnostic" has no drivable seam and is misplaced in Tests
**Original section:** V4b — Runtime panics
**Kind:** validation, implementability, placement
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V4b` (and its paired `V4b-T`) carry a Tests bullet stating: `loom/runtime/internal-error` (NOCEIL-3 uncatchable carve-out): a host-fatal uncatchable condition emits no diagnostic. NOCEIL-3 in `spec_topics/hard-ceilings/ceiling-invariants-and-audit.md` defines this class as the *uncatchable* host fatal — V8's `FATAL ERROR: Reached heap limit … JavaScript heap out of memory` and any other engine fatal on the `OOMErrorCallback` / `abort()` path — which bypasses the JavaScript exception machinery and terminates the host process. The spec is explicit that "the runtime cannot observe them and emits no diagnostic."

Because the condition terminates the process and never enters JS exception flow, "emits no diagnostic" cannot be exercised as an ordinary behavioural test: there is no value to throw, no catch to reach, and no surface to assert against. The only way to "drive" it as a behavioural assertion would be to invent a fault-injection seam that simulates the uncatchable fatal — but NOCEIL-3 specifies precisely that the runtime has no such observation point, so such a seam would contradict the spec and would tempt a stubbed/skipped test that violates the conventions.md "No silent test skipping" rule.

The bullet is therefore an implementation *scoping boundary* ("the runtime-defect catch surface deliberately contains no handler for the uncatchable fatal class") wearing the costume of a `npm test` assertion. As written it lands in a Tests position where a future implementer must either fabricate an unobservable test or quietly drop it. The carve-out is a real and worthwhile constraint; the defect is that it is framed and placed as a behavioural test rather than as a structural/scoping property in Adds.

## Plan Documents

- `docs/plan_topics/V4b-runtime-panics.md` — Adds + Tests (edited)
- `docs/plan_topics/V4b-T-runtime-panics.md` — Tests (edited)
- `docs/plan_topics/V4c-terminal-outcomes.md` — Adds + Tests (read-only; precedent for the structural/architectural-assertion framing)
- `docs/plan_topics/coverage-matrix.md` — §Governance REQ-IDs (read-only; NOCEIL-3 → V4b mapping is unaffected)

## Spec Documents

- `docs/spec_topics/hard-ceilings/ceiling-invariants-and-audit.md` — NOCEIL-3 (read-only)
- `docs/spec_topics/errors-and-results/error-model.md` — Runtime panics / runtime-defect surface (read-only)

## Affected Leaves

**Phases:** Vertical slices

**Leaves (implementation order):**

- V4b — Runtime panics — (modified)
- V4b-T — Runtime panics (tests) — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one drops the unobservable bullet (silently weakening the carve-out and risking a "skipped test that reports success" violation of the No-silent-test-skipping rule), the other invents a fault-injection seam to "observe" a fatal the spec says is unobservable — contradicting NOCEIL-3 and adding a seam the runtime is specified not to have. Either way the intended scoping property (no handler attempts to catch/route the uncatchable fatal class) is not reliably captured.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e ("pi-loom plan: build/update plan for spec.md + review", 2026-06-10)
**History:** `docs/plan_topics/V4b-runtime-panics.md` and `docs/plan_topics/V4b-T-runtime-panics.md` were both added in commit c6a664e (`git log --diff-filter=A --follow` returns only that commit), and `git log -S 'NOCEIL-3 uncatchable carve-out'` over `docs/plan_topics/` reports the same single commit. The defect token entered the corpus with the leaf files' first and only revision; there is no prior baseline in which the bullet was correctly placed, so this is a present-since-inception authoring choice rather than a regression introduced by a later edit.

## Solution Space

**Shape:** single

### Recommendation

Reframe the carve-out as the structural/scoping property it is, mirroring V4c's "no compensating path" framing (V4c states the no-rollback guarantee in Adds and witnesses it structurally rather than by exhaustive behavioural drive). Move the carve-out boundary into `V4b` Adds — state that the uncatchable host-fatal class (V8 `OOMErrorCallback` / `abort()` path) terminates the process and is by construction outside the `loom/runtime/internal-error` catch surface, so the runtime emits no diagnostic for it. Replace the undrivable Tests bullet in `V4b` and `V4b-T` with a structural assertion that the runtime-defect catch surface contains no handler that attempts to intercept or route the uncatchable fatal class (the catchable `RangeError` allocation-failure arm still routes through `loom/runtime/internal-error` and remains behaviourally tested).

Edge cases for the implementer: ensure the surviving behavioural bullet still covers the catchable allocation-failure routing (`RangeError: Invalid string length` / `Invalid array length` / `Maximum call stack size exceeded`) so NOCEIL-3's observable arm remains gated; do not introduce a fault-injection seam for the uncatchable arm; and keep the spec read-only — NOCEIL-3 already states the runtime cannot observe the fatal and emits no diagnostic.

## Relationships

None

---

# T12 — V5a positive declaration-form parse has no asserting test

**Original heading:** Positive declaration-form parse not explicitly asserted
**Original section:** V5a — Schema declarations
**Kind:** validation
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

Every bullet in `V5a`'s **Tests** field (and the identical list in the paired `V5a-T` tests task) asserts a *violation* diagnostic firing: `empty-schema-body`, `empty-enum-body`, `wire-name-collision`, `redundant-wire-name`, `inline-enum`, `non-string-enum-value`, `duplicate-enum-value`, `duplicate-enum-variant-name`, `unknown-variant`. None asserts the *accepted* path.

The positive forms the leaf is responsible for — a well-formed object `schema X { … }` parsing into a node with every field required and `additionalProperties:false` (optional via `T | null`), `schema X = …` alias/union forms, the `field as "Wire": T` wire-rename resolving loom-side identifier vs wire-side key, and `enum X { … }` with `Enum.Variant` resolving to its underlying string value while statically typed as `Enum` — are named only in **Adds** and gestured at by **Ships when** ("`npm test` parses each declaration form and fires each listed code").

Per `conventions.md` §Leaf format, `Adds.` is descriptive and does not bind the implementer on its own; the binding obligations are the **Tests** bullets and the **Ships when** gate. The "parses each declaration form" clause in Ships when is not backed by any concrete Tests assertion naming the expected typed node. A thin implementation that correctly fires all nine violation codes while mishandling the accepted forms (wrong wire-side key mapping, `Enum.Variant` typed as `string` instead of `Enum`, optional-field lowering wrong) would pass the leaf's green-test gate with the defect undetected — and `V5b` (discriminated unions / recursion), `V5d` (lowering / canonical hash), and `V2c` (wire-name translation) consume those typed nodes downstream.

## Plan Documents

- `docs/plan_topics/V5a-T-schema-decls.md` — Tests, Ships when (edited)
- `docs/plan_topics/V5a-schema-decls.md` — Tests, Ships when (edited)
- `docs/plan_topics/conventions.md` — §Leaf format (Adds-binding rule), §Per-phase TDD ritual (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slices (V5)

**Leaves (implementation order):**

- V5a-T — Schema declarations (object / alias / enum) (tests) — (modified)
- V5a — Schema declarations (object / alias / enum) — (modified)

## Consequence

**Severity:** correctness

The leaf's closing evidence proves only that the nine violation codes fire; it certifies nothing about the accepted forms. Two reasonable implementers diverge — one writes positive-path tests anyway under the TDD ritual, another implements only what the Tests bullets list — and a thin or partly-wrong accepted-path implementation (mis-mapped wire name, `Enum.Variant` typed as `string`, wrong optional lowering) ships green and propagates into `V5b`/`V5d`/`V2c`.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `V5a-schema-decls.md` and its paired `V5a-T-schema-decls.md` both entered the corpus in the plan's first and only commit `c6a664e`; `git show c6a664e:docs/plan_topics/V5a-schema-decls.md` confirms the **Tests** field listed only violation-code bullets at inception, with no positive declaration-form assertion ever present. The repository has no prior plan history (`git log --follow` returns the single commit for each file), so the gap was never introduced by a later edit.

## Solution Space

**Shape:** single

### Recommendation

In `V5a-T-schema-decls.md` (the tests task that authors the failing tests) and mirrored into `V5a-schema-decls.md`'s **Tests** field, add bullets asserting each accepted declaration form parses to the expected typed node, sourcing the expected shapes from `spec_topics/schemas.md`:

- A well-formed object `schema X { … }` parses to a node whose lowering marks every declared field required and emits `additionalProperties:false`, with an optional field expressed as `T | null` (cite `schemas.md` §Object schema).
- A `schema X = …` alias/union form parses to the expected alias node (cite `schemas.md` §Type-alias / union schema).
- A `field as "Wire": T` declaration resolves the loom-side identifier for code access while carrying the distinct wire-side key into the lowered `properties`/`required` (cite `schemas.md` §Wire-name renaming).
- An `enum X { … }` (implicit and explicit values) parses and a `Enum.Variant` reference evaluates to the variant's underlying string value while statically typed as `Enum` (cite `schemas.md` §Enum declarations / §Variant access).

Extend the **Ships when** line in both leaves so the gate names the accepted-form observable (each well-formed declaration form produces its expected typed node) alongside the existing "fires each listed code" clause. These accepted-form assertions carry no `loom/...` diagnostic code or numbered REQ-ID, so they add nothing to `coverage-matrix.md` and trigger no closing-gate or `H5b`-Deps obligation — they are pure TDD evidence strengthening the leaf's green-test gate.

## Relationships

- T17 "Absent/empty `tools:` default rule untested" — same-cluster (same Adds-named-but-unasserted positive-path pattern, on V6c; resolves independently)

---

# T13 — V5e names two different five-way partitions of the depth-enforcement boundaries under colliding terms

**Original heading:** "five enforcement sites" vs "five site-classes" name two different partitions
**Original section:** V5e — JSON document depth enforcement
**Kind:** clarity, naming
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V5e` describes the depth-walk boundaries with two different five-way partitions under two different terms, and never states how they relate.

- **Adds** calls them "the five enforcement **sites**." That count and grouping track the spec's five **enforcement points** in `schema-subset.md` §Depth Enforcement: #1 typed-query response, #2 model-driven tool args, #3 code-driven tool args, #4 `params` validation, #5 `invoke<T>` return.
- **Tests** (and `V5e-T` Tests, verbatim) enumerate "the five **site-classes**": typed-query response → `ValidationError`; model-driven tool args → model feedback; code-driven tool args → `CodeToolError`; `params` **and** `invoke<T>` return → `InvokeInfraError`; slash-load `params` → ceiling-#3 cross-route.

The two fives are not the same partition. The Tests grouping folds the spec's #4 (`params` via `invoke`) and #5 (`invoke<T>` return) into a single `InvokeInfraError` class, and promotes the slash-load `params` arm — a sub-case of the spec's #4 — into a class of its own. So both partitions arrive at five only by coincidence: the spec's `{#1, #2, #3, #4, #5}` versus the Tests' `{#1, #2, #3, (#4-invoke + #5), #4-slash-load}`.

**Ships when** then gates on "all five **site-classes**" (the Tests partition) while **Adds** points at the spec's enforcement-point partition under the same numeral. The spec's own canonical term is "enforcement point." A third framing compounds the ambiguity: `V4e` Adds refers to "the four runtime first-enforcement sites" plus the load-time cross-route. An implementer reconciling Adds, Tests, and Ships-when cannot tell which five-way partition the routing-decision test must assert.

## Plan Documents

- `docs/plan_topics/V5e-depth-enforcement.md` — Adds / Tests / Ships when (edited)
- `docs/plan_topics/V5e-T-depth-enforcement.md` — Tests (edited)

## Spec Documents

- `docs/spec_topics/schema-subset.md` — §Depth Enforcement (read-only — authority for the term "enforcement point" and the five-row per-boundary routing table)

## Affected Leaves

**Phases:** Vertical slices (V5)

**Leaves (implementation order):**

- `V5e-T` — JSON document depth enforcement (hard ceiling #4) (tests) — (modified)
- `V5e` — JSON document depth enforcement (hard ceiling #4) — (modified)

## Consequence

**Severity:** correctness

The "five" in Adds, Tests, and Ships-when name three readings of the boundary set, two of which partition differently. A test author could assert per-boundary routing against the spec's five enforcement points rather than the destination-surface grouping the Tests bullet actually enumerates, producing a routing-decision test that diverges from the intended partition while the leaf still reads as internally complete.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 3fa39a9 — pi-loom plan: resolve "V5e per-boundary routing test asserts destination error surfaces its Deps cannot reach" (2026-06-11, Thomas Andersen)
**History:** At inception (c6a664e, 2026-06-10) both Adds and Tests used a single five-way partition matching the spec's five enforcement points (typed-query response, model-driven tool args, code-driven tool args, `params`, `invoke<T>` return), with only a minor "enforcement sites" vs spec "enforcement point" naming drift. Commit 3fa39a9 rewrote the Tests bullet to introduce the distinct "five site-classes" grouping (folding `params`+`invoke<T>` return into `InvokeInfraError`, splitting out slash-load `params`) and propagated "five site-classes" into Ships-when, while Adds kept the inception "five enforcement sites" wording — creating the two-partition collision this finding reports.

## Solution Space

**Shape:** single

### Recommendation

Use one term per partition and state how they relate, in `V5e` and the byte-identical `V5e-T` Tests bullet:

- In `V5e` **Adds**, replace "the five enforcement sites" with the spec's term "the five enforcement points" (per `schema-subset.md` §Depth Enforcement).
- In `V5e` **Tests** and `V5e-T` **Tests**, rename "the five site-classes" to "the five destination-surface classes" and add a clause stating how those classes regroup the spec's five enforcement points: the spec's #4 `params` (invoke arm) and #5 `invoke<T>` return collapse into one `InvokeInfraError` class, and the slash-load arm of #4 `params` is a separate ceiling-#3 cross-route class.
- In `V5e` **Ships when**, change "all five site-classes" to "all five destination-surface classes" so the gate names the same partition the Tests bullet asserts.

Apply the Tests rename identically to `V5e` and `V5e-T`, whose Tests bullets are currently character-for-character identical and must stay in sync.

## Relationships

None

---

# T14 — V4e omits the V6c producer for the `ERR-6` `tools:`-resolution pre-eval failure

**Original heading:** ERR-6 `tools:`-resolution failure producer not enumerated
**Original section:** V4e — Pre-evaluation failures
**Kind:** assumptions
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V4e` (Pre-evaluation failures) asserts `ERR-6`: *`tools:` resolution failure routes pre-eval*. The leaf that produces `tools:`-resolution failures is `V6c` (`tools` callable set and resolution snapshot) — it owns load-time rejection of a prompt-mode `.loom` callee (`loom/load/prompt-mode-callable`) and `tools:` name-collision detection (`loom/load/tool-name-collision`). `V6c` is absent from `V4e`'s `Deps` (`V4e-T`, `V9a`, `V6a`, `V11f`, `V10a`, `V16a`, `V9b`, `V10c`) and is not reachable transitively through any of those leaves' own dependencies.

Every other pre-eval cause in `V4e` names its producer in `Deps`: `V9a` for `ERR-1`, `V6a` for `ERR-3`, `V11f` for `ERR-5`, `V16a` for `ERR-16`, and `V9b`/`V10c` for the synthesised `ERR-7` injection. `ERR-6` (and its sibling `ERR-4`) break that explicit-producer pattern with no in-leaf statement of an alternative drive strategy. An implementer authoring `V4e-T` cannot tell whether `ERR-6` must drive the real `V6c` `tools:`-resolution surface or may inject a synthesised classified failure into the pre-eval router (the strategy `ERR-7` uses explicitly).

The ambiguity also interacts with the tests-task gate: if the implementer drives the real `V6c` surface, the red `V4e-T` suite references `V6c` production symbols that are not declared a dependency, which `conventions.md` §Per-phase TDD ritual classes as a compile-time red that does **not** satisfy the `-T` gate.

## Plan Documents

- `docs/plan_topics/V4e-pre-evaluation-failures.md` — Deps (and ERR-6 Tests bullet / Adds) (edited)
- `docs/plan_topics/V6c-tools-set.md` — named producer of `tools:`-resolution failures (read-only)
- `docs/plan_topics/conventions.md` — §Leaf format Deps rule / §Per-phase TDD ritual "fail red for the intended reason" (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slices (V4)

**Leaves (implementation order):**

- `V4e` — Pre-evaluation failures — (modified)

(`V6c` is referenced read-only; under the recommended fix it becomes a `V4e` dependency but is not itself changed.)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one declares `V6c` in `Deps` and drives the real `tools:`-resolution failure; the other synthesises a classified failure with no producer wiring. The first variant risks an undeclared-dependency compile-red that fails the `-T` gate; the second leaves the real `V6c`-produced failure's pre-eval routing unverified at `V4e`.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `V4e` was authored in its first commit (c6a664e) already carrying the `ERR-6: tools: resolution failure routes pre-eval` Tests bullet while its `Deps` listed only `V4e-T, V9a, V6a, V11f, V10a, V16a`; `V6c` was never present. The later commits touching this file (e2b7e81, 49e3837, 66acde6, b2d5a1f) edited only the `ERR-16` cross-ceiling and `ERR-7` watcher-reload arms, so the missing `ERR-6` producer has been present since the leaf's inception.

## Solution Space

**Shape:** single

### Recommendation

Drive the real `V6c` surface: append `V6c` to `V4e`'s `Deps` and have the `ERR-6` test drive an actual `tools:`-resolution failure produced by `V6c` (e.g. `loom/load/tool-name-collision` or `loom/load/prompt-mode-callable`), matching the explicit-producer pattern `V4e` already uses for `V9a`/`V6a`/`V11f`/`V16a`/`V9b`/`V10c`. Optionally note in the `ERR-6` Tests bullet that the failure is sourced from the `V6c` surface. This is end-to-end faithful — it proves the real `tools:` failure routes pre-eval — and consistent with the dominant pattern in the leaf. `V4e` sequences after `V6c` with no cycle (`V6c`'s deps are `V6c-T`, `V6a`, `V15a`, `V9f` — none reach `V4e`). Edge case: apply the same drive-strategy choice to the sibling `ERR-4` finding so both omitted pre-eval producers are wired identically.

## Relationships

- T15 "V4e ERR-4: binder-model-resolution failure producer (V11a) not enumerated as an explicit dependency" — co-resolve (identical structural omission in the same `V4e` `Deps` field; the drive-strategy choice here should be applied to it too)

---

# T15 — V4e ERR-4: binder-model-resolution failure producer (V11a) not enumerated as an explicit dependency

**Original heading:** ERR-4 binder-model-resolution failure producer not enumerated
**Original section:** V4e — Pre-evaluation failures
**Kind:** assumptions
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V4e`'s `ERR-4` Tests bullet asserts that a binder-model-resolution failure routes to the `loom-system-note` channel pre-evaluation (`triggerTurn:false`). The diagnostic that represents that failure — `loom/load/binder-model-unresolved` — is owned by `V11a` (Binder-model resolution), which is the only leaf whose Tests bullet fires that code when no exact model reference matches.

`V4e`'s `Deps.` field does not list `V11a`. Its only path to `V11a` is the incidental transitive chain `V4e → V11f → V9j → V11a` (`V9j` lists `V11a` in its Deps for the binder inference call, and `V11f` lists `V9j` for cancellation forwarding). That chain exists for `V11f`'s own cancellation needs, not as a declared `ERR-4` producer edge, and `V4e` nowhere states how `ERR-4` is driven.

This breaks the explicit-producer pattern `V4e` uses for its other pre-eval causes: `ERR-1` lists `V9a`, `ERR-3` lists `V6a`, `ERR-5` lists `V11f`, `ERR-16` lists `V16a`, and `ERR-7` explicitly names `V9b`/`V10c` as the failure-injection seam owners (and states it injects a *synthesised* failure rather than standing up the live watcher). For `ERR-4` the leaf states neither: an implementer cannot tell whether `ERR-4` must drive the real `V11a` resolver surface or a synthesised classified binder-model-resolution failure.

## Plan Documents

- `docs/plan_topics/V4e-pre-evaluation-failures.md` — Tests (`ERR-4` bullet) / Deps (edited)
- `docs/plan_topics/V11a-binder-model-resolution.md` — Adds / Tests (read-only | option-dependent: added to V4e Deps under the explicit-producer option)
- `docs/plan_topics/conventions.md` — §Leaf format, Deps bullet (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slices — V4 (Errors and results), V11 (Binder)

**Leaves (implementation order):**

- V4e — Pre-evaluation failures — (modified)
- V11a — Binder-model resolution and strict-capability probe — (option-dependent)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one wires `ERR-4` to drive the real `V11a` `loom/load/binder-model-unresolved` surface (proving the real classified failure routes pre-eval end to end), the other injects a synthesised classified failure (testing routing only). The two produce materially different test coverage for the same bullet, and the synthesised reading leaves the real `V11a`→pre-eval routing path unproven by `V4e`.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** `c6a664e` (pi-loom plan: build/update plan for spec.md + review)
**History:** The `ERR-4` Tests bullet, `V4e`'s `Deps.` line (listing `V11f` but not `V11a`), and `V11a`'s `loom/load/binder-model-unresolved` code were all introduced together in the initial plan-build commit `c6a664e`. `git log -S` over both `binder-model resolution failure routes pre-eval` (in `V4e`) and `binder-model-unresolved` (in `V11a`) reports only `c6a664e`; `git log -S 'V11f' -- docs/plan_topics/V4e-pre-evaluation-failures.md` likewise reports only `c6a664e`. The four later commits touching `V4e` (`e2b7e81`, `49e3837`, `66acde6`, `b2d5a1f`) addressed cross-ceiling and `ERR-7` concerns and did not alter the `ERR-4`/`V11a` relationship. The defect is original to the plan, not introduced by a later edit.

## Solution Space

**Shape:** single

### Recommendation

Enumerate `V11a` as an explicit producer dependency: add `V11a` to `V4e`'s `Deps.` so the `ERR-4` producer (`loom/load/binder-model-unresolved`, owned by `V11a`) is a declared edge, and `ERR-4` drives the real `V11a` resolver surface. In `docs/plan_topics/V4e-pre-evaluation-failures.md`, add `V11a` to the `Deps.` list; optionally tighten the `ERR-4` Tests bullet to read that the binder-model-resolution failure is driven through `V11a`'s real resolver. This matches the dominant explicit-producer pattern already used for `ERR-1`/`ERR-3`/`ERR-5`/`ERR-16` and replaces incidental transitive reach with a declared edge. If the plan author instead intends a synthesised drive (the `ERR-7` approach), state that in the `ERR-4` Tests bullet — the leaf must state one or the other, not leave it implicit. Edge case the implementer must watch: `V11a` is already transitively reachable via `V11f → V9j → V11a`, so adding the explicit edge introduces no new ordering constraint.

## Relationships

- T14 "V4e omits the V6c producer for the `ERR-6` `tools:`-resolution pre-eval failure" — co-resolve (identical defect class in the same `V4e` leaf; same two-option fix shape)
- T16 "Model-registry `getAvailable()` population-timing presupposition uncited at its one-shot consumers (V6a / V9b / V11a)" — decision-overlap (governs the `ctx.modelRegistry.getAvailable()` lifecycle that `V11a`'s resolver — the `ERR-4` producer — reads)

---

# T16 — Model-registry `getAvailable()` population-timing presupposition uncited at its one-shot consumers (V6a / V9b / V11a)

**Original headings:**
- Model registry assumed fully populated at the load pass (shared with V9b)
- Model registry population timing assumed (shared with V6a)
**Original section:** docs/plan_topics/conventions.md (V6a / V9b)
**Kind:** assumptions
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V6a`'s `model:` resolution hook, `V9b`'s load-pass model-reference-matcher wiring, and `V11a`'s binder-model resolution all resolve model references one-shot against `ctx.modelRegistry.getAvailable()` and treat a "reference matches no available model" result as a definitive load failure (`loom/load/model-unresolved` for `V6a`; the injected matcher backing `V11a`'s `loom/load/binder-model-unresolved` for `V9b`/`V11a`). None of the three leaves states the lifecycle precondition that the registry is fully populated before the load pass runs.

The spec carries that precondition at [`host-prerequisites.md#model-registry-population-presupposition`](../spec_topics/pi-integration-contract/host-prerequisites.md#model-registry-population-presupposition): loom 1.0 *presupposes* `getAvailable()` returns the fully-populated model set at the `session_start`-time load pass — the read is one-shot with no retry/poll, and a model the host registers after the load pass leaves the referencing loom load-failed until the operator runs `/reload`. That presupposition is referenced by no plan leaf. Their `Spec` fields point only at the registration/frontmatter topics and the `host-interfaces-core.md` model-registry surface (which pins the *type*, not the population *timing*). Without it surfaced, an implementer cannot tell whether a no-match on a still-warming registry should be treated as a definitive failure or retried, and a host that registers `ModelRegistry` synchronously but populates providers asynchronously would yield spurious `model-unresolved` / `binder-model-unresolved` failures.

## Plan Documents

- `docs/plan_topics/V6a-frontmatter-contract.md` — Spec / Adds (edited)
- `docs/plan_topics/V9b-registration-drain-state.md` — Spec / Adds (model-reference-matcher production wiring point) (edited)
- `docs/plan_topics/V11a-binder-model-resolution.md` — Spec / Adds (already cites the hot-reload recovery note) (edited)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — §model-registry-population-presupposition (read-only)

## Affected Leaves

**Phases:** Vertical slices (V6, V9, V11)

**Leaves (implementation order):**

- `V6a` — Frontmatter field contract — (modified)
- `V9b` — Registration steps and drain-state contract — (modified)
- `V11a` — Binder-model resolution and strict-capability probe — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one treats a `getAvailable()` no-match as a definitive load failure (the spec's intent), the other adds retry/poll logic to wait out a still-warming registry, contradicting the one-shot presupposition. The "still-warming registry yields spurious `model-unresolved`/`binder-model-unresolved`" failure mode is then neither documented nor bounded in the leaves that own the resolution.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** 4088e2e — pi-loom plan: resolve "model/bind_* resolution hooks named in V6a Adds with no closing assertion" (2026-06-10, Thomas Andersen); 5953b18 — pi-loom plan: resolve "V6a model-reference-matcher seam has no declared producer" (2026-06-11, Thomas Andersen)
**History:** 4088e2e added V6a's `loom/load/model-unresolved` Tests bullet, establishing that a `model:` reference matching no available model is a definitive load failure. 5953b18 then wired both V6a's model-resolution hook and V9b's load-pass matcher to resolve one-shot against `ctx.modelRegistry.getAvailable()` (the shared `findExactModelReferenceMatch` contract V11a owns). Neither commit cited the spec's registry-population presupposition (`host-prerequisites.md#model-registry-population-presupposition`, which `git log -S` confirms has never been referenced from any plan leaf), so the leaves bind `getAvailable()` and treat a no-match as definitive load failure without stating that the read assumes a fully-populated registry. (Two enricher findings — the V6a-anchored and V9b-anchored surfaces of the same defect — are merged here; the original Related-Findings cross-link declared them co-resolve, "one edit closes both".)

## Solution Space

**Shape:** single

### Recommendation

Surface the existing spec presupposition in each leaf that resolves a model reference one-shot against `getAvailable()`:

- In `V6a`'s **Spec.** field, add `host-prerequisites.md#model-registry-population-presupposition`. At the `loom/load/model-unresolved` site (Tests bullet, with the supporting statement in Adds), state that the parser reads `ctx.modelRegistry.getAvailable()` once with no retry or poll and treats the returned set as the assumed-fully-populated model set per that presupposition, so a partial or still-warming registry is out of scope and the only recovery for a post-load-pass model registration is operator `/reload`.
- In `V9b`'s **Spec.** field, add the same anchor. Where Adds describes the load-pass matcher wiring (the construction and injection of the concrete `findExactModelReferenceMatch` matcher), note that the matcher runs against the one-shot `getAvailable()` read under that presupposition.
- In `V11a`'s **Spec.** field, add the same anchor. `V11a`'s Adds already carries the hot-reload recovery note but does not cite the population presupposition that underwrites the one-shot read; add that citation alongside the existing recovery note.

Edge case the implementer must honour: a `getAvailable()` no-match is a terminal load failure for the referencing loom — do not add retry/poll/wait logic; the sole recovery path is the operator `/reload` the presupposition names. The spec is read-only for this fix — the presupposition already exists and is authoritative.

## Relationships

- T15 "V4e ERR-4: binder-model-resolution failure producer (V11a) not enumerated as an explicit dependency" — decision-overlap (the load-pass `getAvailable()` read this finding pins is the `ERR-4` producer V11a owns)
- T12 "V5a positive declaration-form parse has no asserting test" — same-cluster (V6a `model:` resolution defaulting surface shares the V6a leaf; resolves independently)

---

# T17 — Absent/empty `tools:` default rule untested

**Original heading:** Absent/empty `tools:` default rule untested
**Original section:** V6c — `tools` callable set and resolution snapshot
**Kind:** validation
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

`frontmatter-fields-a.md` pins the absent/empty `tools:` behaviour as a precise, observable contract: when frontmatter omits `tools:`, the loom runs with an **empty callable set** — the model cannot make tool calls and loom code has no `<name>(...)` callables to resolve — and the Pi session's ambient tools are deliberately *not* inherited. The same topic states `tools: []` and an absent `tools:` field are equivalent. This is a Class-1 observable behaviour.

`V6c` Adds names this obligation ("the default for absent/empty `tools:`"), but neither `V6c`'s Tests bullets nor its paired `V6c-T` tests leaf assert it. The three Tests bullets cover only the prompt-mode-callee rejection, the name-collision/`as`-rename path, and the frozen-snapshot / two-YAML-spellings path. No bullet exercises the resolved callable set when `tools:` is absent or `tools: []`, and `Ships when` does not name the default-resolution assertion.

The non-inheritance default is the spec's deliberate guard against "why did my loom touch the filesystem?" surprises. With no asserting test, an implementation that silently inherits the session's ambient tools — or that treats `tools: []` differently from an absent field — ships with CI green.

## Plan Documents

- `docs/plan_topics/V6c-T-tools-set.md` — Tests (edited)
- `docs/plan_topics/V6c-tools-set.md` — Tests, Ships when (edited)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slices (V6)

**Leaves (implementation order):**

- V6c-T — `tools` callable set and resolution snapshot (tests) — (modified)
- V6c — `tools` callable set and resolution snapshot — (modified)

## Consequence

**Severity:** correctness

The empty-callable-set default and the `tools: []` ≡ absent equivalence are spec-observable behaviours with no asserting test, so a build that silently inherits the Pi session's ambient tools (or that diverges between `tools: []` and an absent field) passes the closing gate. The deliberate no-inheritance guard ships unverified.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** `c6a664e` (pi-loom plan: build/update plan for spec.md + review)
**History:** `docs/plan_topics/V6c-tools-set.md` has two commits. It was created in `c6a664e` already naming "the default for absent/empty `tools:`" in Adds while carrying no asserting Tests bullet for it — the gap is present from the file's first version. The only later commit, `ae66bf1` ("resolve 'V6c/V6c-T Tests bullets name no diagnostic codes'"), added `loom/...` code prefixes to the existing Tests bullets; it did not add a default-resolution test. The coverage hole therefore predates any subsequent edit.

## Solution Space

**Shape:** single

### Recommendation

Add a default-resolution assertion to `V6c-T`'s Tests list (authored red first per the TDD ritual), then mirror it into `V6c`'s Tests and extend `V6c` Ships-when to name it.

- In `docs/plan_topics/V6c-T-tools-set.md`, add a Tests bullet asserting that a loom omitting `tools:` resolves to an empty callable set (the model can make no tool calls and no `<name>(...)` callable resolves), and that `tools: []` resolves to the identical empty callable set — i.e. the two forms are equivalent per `frontmatter-fields-a.md` §`tools`.
- In `docs/plan_topics/V6c-tools-set.md`, add the matching bullet to the Tests list, and extend the `Ships when` sentence to name the default-callable-set resolution (currently it names only resolve / prompt-mode-reject / freeze).

The assertion's content should pin both the absent case and the `tools: []` case to the spec's empty-callable-set default; the spec anchor to cite is `frontmatter-fields-a.md` §`tools` (the `<a id="tools">` paragraph).

## Relationships

- T12 "V5a positive declaration-form parse has no asserting test" — same-cluster (same Adds-names-default-but-Tests-omit-it pattern; resolves independently)

---

# T18 — Best-effort `loom-system-note` fallback chain is unverified (V7a primary path and V9d group-A `Clock.wallNow()` variant)

**Original headings:**
- Fallback chain has no asserting test
- Best-effort fallback chain not asserted
**Original section:** V7a — Diagnostics primitive / V9d — Runtime-event channel and hard-ceiling co-fire
**Kind:** validation
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

`V7a` owns the best-effort degrade path for `loom-system-note` delivery: per [`runtime-event-channel.md`](../../../docs/spec_topics/pi-integration-contract/runtime-event-channel.md), when the always-log emission sequence throws synchronously — `pi.sendMessage` for any note shape, plus `Clock.wallNow()` during `occurred_at` stamping for group-A `details: { event }` notes — the runtime falls back in a fixed order: (1) `ctx.ui.notify(content, "error")` (skipped when `display: false` or when `content === ""`), then (2) a `loom/runtime/system-note-delivery-failed` diagnostic carrying `message = original content` and `hint = underlying error message`, and if both channels fail, (3) `console.error` (which, for panic-routed notes, must include the original panic message). Both `V7a` and `V9d` name this chain as a normative obligation in their Adds.

`V7a-T`'s Tests assert only the primary emission path: `DIAG-1` (content-line format), multi-error batching, a re-scan re-emit, and `PIC-21`. `PIC-21` covers a *different* failure mode — a throw from inside the registered renderer body — governed by Renderer registration, not the `pi.sendMessage`/`Clock.wallNow()` synchronous-throw fallback. `V9d` Adds the group-A `details: { event }` emission sequence (where `Clock.wallNow()` stamps `occurred_at`) but its Tests assert only the `masked` rules and the always-log exactly-once / null-policy rules. The synchronous-throw branch is unverified in both. No test drives the emission sequence to throw and asserts the degrade order, the `display: false` / `content === ""` skip of step 1, the `system-note-delivery-failed` payload (`message`/`hint` sourcing), or the no-re-invoke-`Clock.wallNow()` rule on a stamping throw.

## Plan Documents

- `docs/plan_topics/V7a-T-diagnostics-primitive.md` — Tests (edited)
- `docs/plan_topics/V7a-diagnostics-primitive.md` — Tests, Ships when (edited)
- `docs/plan_topics/V9d-runtime-event-channel.md` — `V9d` Tests / Ships-when (edited)
- `docs/plan_topics/V9d-T-runtime-event-channel.md` — `V9d-T` Tests (edited)
- `docs/plan_topics/coverage-matrix.md` — diagnostic-code coverage table (option-dependent)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — best-effort fallback rules (read-only)
- `docs/spec_topics/diagnostics.md` — `loom/runtime/system-note-delivery-failed` registration (read-only)

## Affected Leaves

**Phases:** V7 — Diagnostics; V9 — Extension host integration

**Leaves (implementation order):**

- `V7a-T` — Diagnostics primitive and `loom-system-note` channel (tests) — (modified)
- `V7a` — Diagnostics primitive and `loom-system-note` channel — (modified)
- `V9d` — Runtime-event channel and `masked` co-fire — (modified)

## Consequence

**Severity:** correctness

The fallback chain is a normative best-effort obligation but has no red test, so `V7a` and `V9d` can pass their green gate with the degrade path implemented incorrectly or omitted entirely. Two implementers could diverge on the skip conditions, the `system-note-delivery-failed` payload sourcing, or the `Clock.wallNow()` no-retry rule, and a runtime that silently drops diagnostics when the host `pi.sendMessage` throws would ship undetected.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** Both `V7a-diagnostics-primitive.md` (whose Adds names the `sendSystemNote → ctx.ui.notify → console.error` fallback chain) and `V9d-runtime-event-channel.md` (whose Adds names the group-A `details: { event }` emission sequence with `Clock.wallNow()` stamping) were created in the inception commit c6a664e; neither has ever carried a Tests bullet driving `pi.sendMessage` / `Clock.wallNow()` to throw. `git log -S "fallback chain"` on `V7a` returns only c6a664e. The assertion gap is original to the plan corpus; the later `PIC-21` addition (af2ec83) covered the renderer-throw mode only and did not close it. (Two enricher findings — the V7a generic-chain finding and the V9d group-A variant — are merged here; the original cross-link declared them co-resolve, "the same V7a-T fallback test closes this finding".)

## Solution Space

**Shape:** single

### Recommendation

Add the fallback-path assertions across the two owning leaves, keeping the generic chain on `V7a` (which Adds the chain) and the group-A `Clock.wallNow()`-throw variant on `V9d` (which introduces it):

In `docs/plan_topics/V7a-T-diagnostics-primitive.md` (and mirror in `docs/plan_topics/V7a-diagnostics-primitive.md` Tests), assert:
- On a `display: true` note whose `pi.sendMessage` throws: step 1 invokes `ctx.ui.notify(content, "error")`; when `ctx.ui.notify` also throws, step 2 emits a `loom/runtime/system-note-delivery-failed` diagnostic with `message` equal to the original note's `content` and `hint` equal to the underlying throw's message; when both channels fail, the failure reaches `console.error` and execution continues.
- On a `display: false` (or `content === ""`) note: step 1's `ctx.ui.notify` is skipped and the fallback proceeds straight to the step-2 diagnostic.
- For a panic-routed note reaching the final-resort `console.error`: the original panic message is included in the log.

In `docs/plan_topics/V9d-T-runtime-event-channel.md` (and mirror in `V9d` Tests), assert the group-A synchronous-throw branch: a group-A `details: { event }` emission in which `Clock.wallNow()` throws during `occurred_at` stamping never constructs the `RuntimeEvent` (no `occurred_at`), does **not** re-invoke `Clock.wallNow()` in the fallback (no retry, no sentinel), and proceeds to the step-2 `loom/runtime/system-note-delivery-failed` diagnostic whose `hint` carries the `Clock.wallNow()` throw message.

Broaden `V7a`'s Ships-when so the gate observes the degrade path (e.g. that a forced `pi.sendMessage` throw still surfaces the diagnostic content through the fallback). Do not fold in `PIC-21`'s renderer-body-throw case (a distinct failure mode). The tests may stub the host seams (`pi.sendMessage`, `ctx.ui.notify`, `Clock.wallNow`) to throw on demand. If the implementer adds an explicit coverage row for `loom/runtime/system-note-delivery-failed`, it belongs against `V7a` in `coverage-matrix.md`; that code currently has no coverage entry.

## Relationships

- T19 "V7a multi-error batching test sources its batch from parse + transitive `.warp` import machinery absent from its Deps" — same-cluster (same `V7a` / `V7a-T` leaf, a different Tests bullet; resolves independently)

---

# T19 — V7a multi-error batching test sources its batch from parse + transitive `.warp` import machinery absent from its Deps

**Original heading:** Multi-error batching test assumes parse + transitive `.warp` import machinery its Deps lack
**Original section:** V7a — Diagnostics primitive
**Kind:** assumptions
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V7a` (and its paired `V7a-T`) is the diagnostics primitive: it owns the `loom-system-note` channel and the multi-error batching contract — one `sendMessage` per `.loom` carrying the full `Diagnostic[]`. Its multi-error Tests bullet, however, specifies the batch as "a file with several parse errors (plus transitive `.warp` import errors) … ordered by `(file, line, col)` across an entry `.loom` and ≥2 transitively-imported `.warp` modules (per implementation-notes.md — Static-resolution load pass … which aggregates each visited file's diagnostics into the entry loom's drain in this order)."

Producing that fixture from first principles requires the static-resolution load pass (owned by `V15a`) and the `.warp` import-resolution subsystem (owned by `V15c`). `V7a`'s and `V7a-T`'s `Deps` are only `V7a-T` / `H4a` — neither names `V15a` nor `V15c`, and by build order those leaves are picked up far later. The test as written therefore asserts behaviour of machinery the leaf cannot assume exists when it is implemented.

The batching primitive does not need real parse or import to be tested: a synthetic `Diagnostic[]` spanning a synthetic entry `.loom` filename and ≥2 synthetic `.warp` filenames exercises both the single-envelope batching contract and the `(file, line, col)` ordering the coverage matrix assigns to `V7a`. The real cross-file aggregation over a live transitive walk is a separate contract owned by the load-pass / import leaves and tested there.

## Plan Documents

- `docs/plan_topics/V7a-diagnostics-primitive.md` — Tests (multi-error bullet) (edited)
- `docs/plan_topics/V7a-T-diagnostics-primitive.md` — Tests (multi-error bullet) (edited)
- `docs/plan_topics/V15a-invocation-core.md` — Static-resolution load pass (read-only)
- `docs/plan_topics/V15c-imports.md` — `.warp` import resolution (read-only)
- `docs/plan_topics/coverage-matrix.md` — IMPL load-pass / cross-file aggregation-order row (read-only)

## Spec Documents

None — the spec's `Multi-error reporting` (`diagnostic-shape.md`) and `Static-resolution load pass` (`implementation-notes.md`) text is internally consistent; the fix is confined to the plan leaf files.

## Affected Leaves

**Phases:** Vertical slice V7

**Leaves (implementation order):**

- `V7a-T` — Diagnostics primitive and `loom-system-note` channel (tests) — (modified)
- `V7a` — Diagnostics primitive and `loom-system-note` channel — (modified)

## Consequence

**Severity:** correctness

The multi-error test, as written, sources its batch from real transitive `.warp` import + load-pass machinery (`V15a`, `V15c`) that `V7a`'s `Deps` do not declare and that, by build order, does not exist when `V7a` is picked up. Two reasonable implementers diverge: one reads the bullet literally and either blocks (the fixture cannot be produced) or wires a spurious early dependency on the import subsystem; another reads it as a synthetic batch and tests only the channel. The leaf cannot ship its intended primitive deterministically.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen); 249cec5 — pi-loom plan: resolve "implementation-notes.md (IMPL) unmapped in coverage matrix" (2026-06-11, Thomas Andersen)
**History:** c6a664e created `V7a`/`V7a-T` with a multi-error test that already cited "transitive `.warp` import errors" while the leaf's `Deps` were only `V7a-T`, `H4a`, seeding the gap. 249cec5 sharpened the bullet, adding the explicit `(file, line, col)` ordering "across an entry `.loom` and ≥2 transitively-imported `.warp` modules" tied to the Static-resolution load pass (and the matching coverage-matrix IMPL row), deepening the test's reliance on parse + transitive `.warp` import machinery the `Deps` still do not declare.

## Solution Space

**Shape:** single

### Recommendation

In both `docs/plan_topics/V7a-diagnostics-primitive.md` and `docs/plan_topics/V7a-T-diagnostics-primitive.md`, reword the multi-error Tests bullet so the `Diagnostic[]` under test is a synthetic in-test batch — constructed directly with a synthetic entry `.loom` filename and ≥2 synthetic `.warp` filenames — rather than one produced by a real parse / transitive-import / load-pass run. The bullet then asserts the batching primitive: exactly one `sendMessage` carries the full batch in `content` and the `Diagnostic[]` in `details.diagnostics`, ordered by `(file, line, col)`; no fast-fail, no per-error fan-out.

Strike the parenthetical that sources the order from the load pass ("per [implementation-notes.md — Static-resolution load pass] IMPL area, which aggregates each visited file's diagnostics into the entry loom's drain in this order"), because that live cross-file aggregation is exercised by the real transitive walk owned by `V15a` (with `.warp` import-error collection owned by `V15c`), not by the `V7a` primitive. Leave `V7a` / `V7a-T` `Deps` at `V7a-T`, `H4a`. No coverage-matrix edit is needed. Edge case for the implementer: choose synthetic filenames and per-file line/col values so both sort keys (file-major, then line/col) are observable — feed the diagnostics unordered and assert the emitted order, so a primitive that does not sort reddens the test.

## Relationships

- T18 "Best-effort `loom-system-note` fallback chain is unverified" — same-cluster (same `V7a` / `V7a-T` leaf, different Tests bullet; resolves independently)

---

# T20 — `Clock` seam's functional behaviour is unverified — `V8b-T`'s `PIC-12` asserts only the ambient-access ban

**Original heading:** `Clock` timing-method behaviour not behaviourally asserted
**Original section:** V8b — Clock, FileSystem, IdSource, FileWatcher, TokenEstimator seams
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The `Clock` seam (`PIC-12`) is closed by the paired `V8b-T` / `V8b` leaves. The `PIC-12` Tests bullet asserts only two things: that the `Clock` is constructed per-runtime, and that an architectural (grep-style) scan finds no *direct* ambient timing reference outside the `WallClock` adapter. Neither of those exercises the seam's *functional* contract.

The spec's `PIC-12` ([`host-interfaces-services.md` — PIC-12](../../docs/spec_topics/pi-integration-contract/host-interfaces-services.md)) pins concrete observable behaviour for both the production `WallClock` adapter and the `FakeClock` test double: `now()` returns monotonic / accumulated time and is *not* implicitly advanced; `wallNow()` returns the constructor-injected epoch and is likewise *not* implicitly advanced; `FakeClock.advance(ms)` synchronously fires every timer whose deadline has elapsed, in deadline order (equal deadlines in registration order); `clearTimeout` before the deadline prevents the callback; and `clearTimeout` on an already-fired handle is a no-op. The `WallClock` adapter delegates `now()`→`performance.now()`, `wallNow()`→`Date.now()`, and the timer methods to the globals.

Because none of that is in `PIC-12`'s acceptance criteria, the `V8b` closing gate (`Ships when: npm test asserts each seam's contract`) passes against the architectural ban alone. A `Clock` implementation whose `setTimeout` never fires, whose `clearTimeout` is wired to the wrong handle, or whose `now()`/`wallNow()` return constants would still satisfy `PIC-12`. `PIC-12` is the only odd one out among the five seams in this leaf — `PIC-13` (`.code` mapping + `readBytes`), `PIC-14` (three change kinds), and `PIC-16` (delegates to `estimateTokens`) each assert observable behaviour, while `PIC-12` asserts only scope and the ambient-reference ban.

## Plan Documents

- `docs/plan_topics/V8b-T-clock-fs-id-watch-token-seams.md` — `PIC-12` Tests bullet (edited)
- `docs/plan_topics/V8b-clock-fs-id-watch-token-seams.md` — `PIC-12` Tests bullet, `Ships when` (edited — kept in lock-step with the `-T` bullet)
- `docs/plan_topics/coverage-matrix.md` — `PIC-12 … → V8b` row (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slice V8 — Pi host seams

**Leaves (implementation order):**

- `V8b-T` — `Clock`, `FileSystem`, `IdSource`, `FileWatcher`, `TokenEstimator` seams (tests) — (modified)
- `V8b` — `Clock`, `FileSystem`, `IdSource`, `FileWatcher`, `TokenEstimator` seams — (modified)

## Consequence

**Severity:** advisory

If the plan ships unfixed, the `V8b` closing gate verifies only that the `Clock` is per-runtime and that no ambient timing call escapes the `WallClock` adapter; it never verifies that the seam's timer scheduling/cancellation or value-returning methods actually work. A non-functional `Clock` (e.g. a `setTimeout` that never fires, or a mis-wired `clearTimeout`) would pass `PIC-12` and ship, and downstream consumers that inject a `FakeClock` in their own tests would not exercise the production `WallClock` adapter's wiring either.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e (pi-loom plan: build/update plan for spec.md + review, 2026-06-10)
**History:** `git log --follow` / `git log -S` over `docs/plan_topics/V8b-clock-fs-id-watch-token-seams.md` and its `-T` partner show the leaf was first authored in `c6a664e`. At that commit the `PIC-12` Tests bullet already read only "`Clock` is per-runtime; an architectural test asserts no ambient timing call outside the `WallClock` adapter" — no behavioural assertion of the timer or value-returning methods was ever present. Three later commits that touch the file (`07555ea`, `49379da`, `f005760`) refined the ambient-access scan wording but none added a functional assertion. The verification gap has therefore existed since the leaf was first authored.

## Solution Space

**Shape:** single

### Recommendation

Add behavioural assertions for the `Clock` seam to the `PIC-12` bullet in `docs/plan_topics/V8b-T-clock-fs-id-watch-token-seams.md` (the tests leaf, where the red tests are authored), and mirror the same additions into `docs/plan_topics/V8b-clock-fs-id-watch-token-seams.md`'s `PIC-12` bullet so the two stay in lock-step (the impl leaf's `Ships when` is `npm test asserts each seam's contract`). Keep the existing per-runtime + ambient-scan text; add coverage of the functional contract drawn from spec `PIC-12`:

- `FakeClock`: `advance(ms)` synchronously fires every timer whose deadline has elapsed in deadline order, with equal-deadline timers firing in registration order; a `clearTimeout` before the deadline prevents the callback; `clearTimeout` on an already-fired handle is a no-op; `now()` returns the accumulated time and is not implicitly advanced by `advance`; `wallNow()` returns the constructor-injected epoch and is not implicitly advanced.
- `WallClock` adapter: a callback scheduled through the adapter's `setTimeout` fires, `clearTimeout` cancels it before it fires, `now()` delegates to `performance.now()`, and `wallNow()` delegates to `Date.now()`.

Edge case the implementer must watch: `PIC-12`'s preamble cites GOV-18 arm (a) — the exact member *signatures* of this internal DI seam are non-normative, while the per-member usage constraints and the timing-source ban are normative. The added assertions must therefore exercise observable behaviour (a timer fires, a value is returned, a handle is cancelled), not pin the member signatures.

## Relationships

- T51 "`V8a-T` tests the Clock-backed Checkpoint yield kind but omits `V8b` from its Deps" — same-cluster (both touch the `Clock` seam; resolve independently)

---

# T21 — V9a PIC-6 binds the factory's total no-throw guarantee to a partial try/catch mechanism

**Original heading:** PIC-6 "factory never throws" total guarantee bound to a partial mechanism
**Original section:** V9a — Capability probe
**Kind:** overclaim
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

The spec's PIC-6 (`capability-probe.md` §Probe-wide invariants) is a *total* guarantee — "The factory MUST NOT throw" — and the spec backs it with more than the per-check `try`/`catch`: the §Self-failure clause routes any throw (including throws during `process.versions` evaluation, a hostile getter/`Proxy` on a `typeof`/`in` target, or `package.json` resolution/parse outside the four enumerated step-(d) conditions) to a `details.kind = "probe-failed"` emission, and §"On failure: refusal and diagnostic" routes that emission through the `sendSystemNote → ctx.ui.notify → console.error` fallback chain "since the renderer itself may be the missing capability." The guarantee therefore covers the catch-handler bodies, discriminator selection, probe orchestration, and the `loom/load/host-incompatible` emission/serialiser path — not merely the five checks.

V9a's PIC-6 Tests bullet (carried identically in V9a and V9a-T) reads "the factory never throws — each check is `try`/`catch`-wrapped." This reduces the total guarantee to a single partial mechanism: it asserts that the five checks are wrapped, but says nothing about a throw originating in the catch-handler bodies, the discriminator-selection logic, or the emission path. The leaf's `Ships when` reinforces the gap by exercising only the named failure kinds ("the probe refuses on each failure kind with the right `details.kind`"), so the `probe-failed` self-failure route and the emission fallback chain are never proven to keep a throw from escaping the factory.

An implementer reading the bullet at face value would wrap the five checks, prove each failure kind, and consider PIC-6 satisfied while leaving the emission/serialiser path able to throw out of the factory — violating the spec's MUST-NOT-throw contract precisely in the scenario (a missing/throwing renderer host) the spec's fallback chain exists to cover.

## Plan Documents

- `docs/plan_topics/V9a-capability-probe.md` — Tests bullet `PIC-6`; `Ships when` (edited)
- `docs/plan_topics/V9a-T-capability-probe.md` — Tests bullet `PIC-6` (edited)
- `docs/plan_topics/H4a-factory-shell-and-harness.md` — Adds / Convention (never-throw factory boundary) (read-only)
- `docs/plan_topics/coverage-matrix.md` — PIC-6 → `V9a` row (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/capability-probe.md` — §Probe-wide invariants (PIC-6), §Self-failure, §"On failure: refusal and diagnostic" (read-only)

## Affected Leaves

**Phases:** V9 — Extension host integration (Vertical slices)

**Leaves (implementation order):**

- V9a-T — Capability probe (Step 0) (tests) — (modified)
- V9a — Capability probe (Step 0) — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one wraps the entire probe (including the emission/serialiser path) per the spec's total guarantee, the other wraps only the five checks per the literal Tests bullet and leaves the emission path able to throw out of the factory. The second produces a leaf that passes its own gate yet violates the spec's "factory MUST NOT throw" contract exactly when the renderer host is the missing capability — the case the `sendSystemNote → ctx.ui.notify → console.error` fallback chain exists to survive.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** The `V9a-capability-probe.md` leaf entered the corpus in c6a664e with the PIC-6 Tests bullet already phrased as "the factory never throws — each check is `try`/`catch`-wrapped", binding the total guarantee to the per-check mechanism from the file's first commit (`git log -S 'the factory never throws'` localises the phrase to that single commit). The only later edit to the file, b9de3ee, touched the `FACTORY_PROBABLE_CAPABILITIES` / V18a partition constant and left the PIC-6 phrasing unchanged.

## Solution Space

**Shape:** single

### Recommendation

In `V9a-capability-probe.md` and its paired `V9a-T-capability-probe.md`, revise the `PIC-6` Tests bullet so the assertion tracks the spec's total guarantee ("The factory MUST NOT throw", `capability-probe.md` §Probe-wide invariants / §Self-failure) rather than only the per-check `try`/`catch` mechanism. The bullet must cover the throw sites the current phrasing leaves uncovered: the catch-handler bodies, discriminator selection, probe orchestration, and the `loom/load/host-incompatible` emission path (routed through `sendSystemNote → ctx.ui.notify → console.error`). Add an assertion that a throw originating in the emission/serialiser path — not just inside one of the five checks — still leaves the factory returning normally, exercising the `probe-failed` self-failure route and the emission fallback chain. Extend the `V9a` `Ships when` condition, which currently proves only that "the probe refuses on each failure kind," to also name this no-throw-escapes guarantee under an emission-path throw. The implementer should watch that the new assertion drives a throw from the emission path specifically (e.g. a stubbed `sendSystemNote`/serialiser that throws), distinct from the existing per-check failure-kind vectors, so the gap is closed rather than re-covered by the same five paths.

## Relationships

- T22 "V9a `host-incompatible` payload refinement fields have no proving assertion" — same-cluster (same V9a leaf and the same `host-incompatible` emission path; resolves independently)

---

# T22 — V9a `host-incompatible` payload refinement fields have no proving assertion

**Original heading:** `host-incompatible` payload refinement fields unasserted
**Original section:** V9a — Capability probe
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The capability-probe spec (`spec_topics/pi-integration-contract/capability-probe.md`) makes the `loom/load/host-incompatible` payload's refinement fields a normative, deterministic contract, not just the `details.kind` discriminator. On an `sdk-capability-missing` failure the payload MUST carry `details.member` naming the first member (in the fixed iteration order) whose `typeof <path> === "function"` check returned false — the spec states the iteration order "is normative: it makes the failing member deterministic, so a conformance test that removes exactly one of the nine members can predict which member the runtime names." Likewise, the peer-dep kinds (`peer-dep-out-of-range` / `peer-dep-malformed-version`) MUST carry `details.package`, the `probe-failed` self-failure route MUST carry `details.step` (and `details.package` when the throw is in step (d)) plus `details.cause`, and every kind MUST carry `details.observed` / `details.required`.

V9a's (and V9a-T's) Tests assert only "the correct closed `details.kind` discriminator". No bullet asserts any of the refinement fields, and the Ships-when condition reduces to "proves the probe refuses on each failure kind with the right `details.kind` and binds nothing." The deterministic-failing-site obligation — which the spec calls "load-bearing" and which the diagnostics-side contract (`spec_topics/diagnostics/placeholder-rendering-b.md#host-incompatible-observed-required`) restates as a test contract — therefore has no closing assertion on the leaf that owns the probe.

A V9a implementation that emits the correct `kind` but a wrong, empty, or non-deterministic `details.member` / `details.package` / `details.step` / `details.cause` / `details.observed` / `details.required` passes every V9a test green. The closing gate for these PIC observability obligations is vacuous on exactly the determinism property the spec went out of its way to pin.

## Plan Documents

- `docs/plan_topics/V9a-T-capability-probe.md` — Tests (edited)
- `docs/plan_topics/V9a-capability-probe.md` — Tests, Ships when (edited)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/capability-probe.md` — Step 0 (a)–(e), On failure, Self-failure (read-only)
- `docs/spec_topics/diagnostics/placeholder-rendering-b.md` — `#host-incompatible-observed-required` (read-only)

## Affected Leaves

**Phases:** Vertical slices — V9 (Extension host integration)

**Leaves (implementation order):**

- V9a-T — Capability probe (Step 0) (tests) — (modified)
- V9a — Capability probe (Step 0) — (modified)

## Consequence

**Severity:** correctness

A conforming-looking V9a can ship with incorrect or non-deterministic `host-incompatible` refinement fields while the tests stay green, because only `details.kind` is exercised. The spec's deterministic-failing-site contract (which member/package/step the payload names) — relied on by operator triage and by the diagnostics-side test contract — is then an unproven obligation, and a regression that scrambles `details.member`/`details.package`/`details.step` would not redden CI.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** The `V9a` and `V9a-T` leaf pages were both created in `c6a664e`, the initial plan-build commit, and their `host-incompatible` Tests bullet has asserted only the `details.kind` discriminator since that first commit (`git log -S 'host-incompatible'` reports only `c6a664e` for `V9a-T-capability-probe.md`, and `git log -S 'details.member'` reports no commit ever touching either leaf). The later commit `b9de3ee` added the `FACTORY_PROBABLE_CAPABILITIES` PIC-5 bullets and did not touch the refinement-field coverage. The gap was never introduced by a later edit; it has been present since inception.

## Solution Space

**Shape:** single

### Recommendation

Extend the failure-emission Tests bullet in `V9a-T-capability-probe.md` (and mirror it in `V9a-capability-probe.md`) so that, in addition to `details.kind`, each failure kind asserts its spec-normative refinement fields against a deterministic failing site, citing `capability-probe.md` and the diagnostics-side contract `placeholder-rendering-b.md#host-incompatible-observed-required`:

- `sdk-capability-missing`: removing exactly one factory-probable member (e.g. `pi.setActiveTools`) yields `details.member === "pi.setActiveTools"` (the first member in the normative iteration order whose check fails), `details.observed === "undefined"`, `details.required === "function"`.
- `peer-dep-out-of-range` / `peer-dep-malformed-version`: `details.package` names the offending scoped package; `details.observed` is the raw/`"<unresolvable>"` string and `details.required` is the loom 1.0 Pi-SDK pin range.
- `abortsignal-shape`: `details.observed` / `details.required` per the failing member's kind (`typeof`-checked members → `typeof`-string vs `"function"`; `prototype-property` members → `"absent"` vs `"present"`).
- `typebox-shape` and `node-floor`: `details.observed` / `details.required`.
- `probe-failed`: `details.step` names the throwing check (`"peer-dep-version"` for the step-(d) neutral label), `details.cause` carries the underlying `Error.message`, and `details.package` names the package in flight when `details.step === "peer-dep-version"`.

Extend the V9a Ships-when condition to name the refinement-field determinism alongside the existing `details.kind` clause so the closing gate covers it. Cite the spec anchors rather than restating the per-kind field rules in the leaf. No spec edit is required.

## Relationships

- T21 "V9a PIC-6 binds the factory's total no-throw guarantee to a partial try/catch mechanism" — same-cluster (same V9a leaf and `host-incompatible` emission path; resolves independently)

---

# T23 — Prompt-mode failure-path and short-circuit ordering have no asserting test

**Original heading:** Prompt-mode short-circuit failure-path / ordering unasserted
**Original section:** V9c — Prompt-mode conversation drive
**Kind:** validation
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

`V9c` (and its paired tests task `V9c-T`) drives a prompt-mode query end-to-end and asserts only the happy path: the trailing-turn `Ok(string)` extraction, plus `PIC-2`/`PIC-17`/`PIC-18` on the active-set window and the `pi.on` subscription. The two failure branches the spec makes normative are named in `V9c` **Adds** ("the `stopReason:"error"` probe", cancel-forward into `loomAbort`) but neither leaf carries an asserting Tests bullet for them.

`conversation-drive.md` §`prompt-mode-error-detection` and §`untyped-query-ok-extraction` pin both as Class-1 obligations: a driven turn whose trailing `assistant.stopReason === "error"` MUST resolve to `Err(QueryError { kind: "transport", ... })` (with `message` the fixed string `"provider transport failure"` when `errorMessage` is absent), and the `Ok(string)` extraction MUST run *downstream* of both the cancellation short-circuit (`loomAbort.signal.aborted` → `Err(QueryError { kind: "cancelled" })`) and the `stopReason:"error"` short-circuit, "never reordering or bypassing them". `coverage-matrix.md` row 80 maps that extraction-ordering MUST to `V9c` as its closing leaf.

With no test exercising those branches, a build that extracts `Ok("")` on a transport-error turn — or one that reads session error state instead of synthesising `Err(cancelled)` on a pre-aborted turn — passes the gate green while violating the contract.

## Plan Documents

- `docs/plan_topics/V9c-T-conversation-drive.md` — Tests (edited)
- `docs/plan_topics/V9c-conversation-drive.md` — Tests (edited)
- `docs/plan_topics/V17a-cancellation-core.md` — `loomAbort` controller / cancel-forwarding (read-only)
- `docs/plan_topics/coverage-matrix.md` — conversation-drive extraction-ordering row (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/conversation-drive.md` — §`prompt-mode-error-detection`, §`untyped-query-ok-extraction` (read-only)

## Affected Leaves

**Phases:** Vertical slices (V9, V17)

**Leaves (implementation order):**

- `V9c-T` — Prompt-mode conversation drive and active-set gating (tests) — (modified)
- `V9c` — Prompt-mode conversation drive and active-set gating — (modified)
- `V17a` — Cancellation core — (blocked)

## Consequence

**Severity:** correctness

A thin implementation that returns `Ok("")` on a transport-error turn, or that fails to short-circuit a pre-aborted turn to `Err(cancelled)`, ships green because no test observes either branch. Two implementers could reasonably diverge on whether extraction runs before or after the error/cancel checks, and a wrong choice silently violates the conversation-drive ordering MUST.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `V9c-conversation-drive.md` entered the corpus in the leaf's first commit c6a664e already carrying only the happy-path `Ok(string)` extraction bullet plus `PIC-17`/`PIC-18`; the `stopReason:"error"` transport probe and the cancellation short-circuit were named in **Adds** from that first commit but never given asserting Tests bullets. Later commits (2ce483b added `PIC-2`; ecedd5f added the `V17a` cancel-forwarding dependency) extended the leaf without closing the failure-path gap, so the defect is present since the leaf's inception.

## Solution Space

**Shape:** single

### Recommendation

Add two failing-test bullets to `V9c-T`'s **Tests** list (where the red tests are authored), and mirror them in `V9c`'s **Tests** list so the implementation leaf's gate names them:

- A driven turn whose trailing `assistant.stopReason === "error"` resolves the untyped query to `Err(QueryError { kind: "transport", ... })`; when the turn's `errorMessage` is absent, `message` equals `"provider transport failure"`.
- A query whose `loomAbort.signal.aborted` is true when `waitForIdle()` resolves yields `Err(QueryError { kind: "cancelled" })` and does not reach the `Ok(string)` extraction — witnessing that the cancel short-circuit runs upstream of extraction (per `conversation-drive.md` §`untyped-query-ok-extraction`).

Cite `V17a` for the `loomAbort` controller facet; it is already in both leaves' **Deps**, so no Deps edit is required. The transport bullet doubles as the ordering witness: a build extracting `Ok("")` on a `stopReason:"error"` turn must fail it.

## Relationships

- T24 "PIC-17 active-set snapshot/restore window owned by both V9c and V9f" — same-cluster (same `V9c` leaf; resolves independently)

---

# T24 — PIC-17 active-set snapshot/restore window owned by both V9c and V9f

**Original heading:** PIC-17 snapshot/restore ownership split between V9c and V9f
**Original section:** V9c — Prompt-mode conversation drive
**Kind:** clarity
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

The active-set allowlist gating window — the four-step `snapshot pi.getActiveTools()` → `pi.setActiveTools([...])` → issue query → `finally`-restore sequence — is defined normatively as **PIC-17** in `pi-integration-contract/tool-registration-lifetime.md` (anchor `#pic-17`). That spec page is cited by `V9f`, not by `V9c`. `V9c` cites only `conversation-drive.md`, `host-interfaces-core.md`, and `subagent.md`, yet its **Adds** enumerates the full window ("the active-set gating window (snapshot → `setActiveTools` → query → `finally` restore; ambient tools not inherited)") and its **Tests** (and `V9c-T` Tests) assert `PIC-17` directly. The coverage matrix maps `PIC-17, PIC-18 | V9c`.

`V9f` independently claims the same block: its **Adds** lists "the snapshot/restore on the prompt path", and it owns the two step-keyed failure protocols that operate *inside* PIC-17's steps — `PIC-8` (a step-4 restore throw) and `PIC-19` (a step-1/step-2 snapshot/swap-install throw), both mapped `PIC-8, PIC-19 | V9f`. The spec's `tool-registration-lifetime.md` co-locates PIC-17, PIC-8, and PIC-19 as one protocol, and `conversation-drive.md` defers to it ("whose active-set enforcement is specified by Tool registration lifetime — Active-set allowlist gating (PIC-17)").

The snapshot/restore window is therefore owned twice, and the two owners are not linked: `V9c` **Deps** are `V9c-T, V9a, V9j, V8a, V17a` and `V9f` **Deps** are `V9f-T, V9a, V5d` — neither names the other. `V9f`'s PIC-8/PIC-19 tests assert behaviour on "step 4" / "step 1/step 2" of a step structure that the plan assigns to `V9c`, across a dependency boundary that does not exist.

## Plan Documents

- `docs/plan_topics/V9c-conversation-drive.md` — Adds, Tests, Deps (edited)
- `docs/plan_topics/V9c-T-conversation-drive.md` — Tests, Deps (edited)
- `docs/plan_topics/V9f-tool-registration-lifetime.md` — Adds, Tests (edited)
- `docs/plan_topics/V9f-T-tool-registration-lifetime.md` — Tests (edited)
- `docs/plan_topics/coverage-matrix.md` — PIC-17 / PIC-18 mapping row (edited)
- `docs/plan_topics/conventions.md` — §Leaf format (Spec / Deps fields) (read-only)
- `docs/plan.md` — V9 — Extension host integration section (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slice V9 — Extension host integration

**Leaves (implementation order):**

- V9c — Prompt-mode conversation drive and active-set gating — (modified)
- V9c-T — Prompt-mode conversation drive and active-set gating (tests) — (modified)
- V9f — Tool-registration lifetime and visibility — (modified)
- V9f-T — Tool-registration lifetime and visibility (tests) — (modified)

## Consequence

**Severity:** correctness

Two implementers picking up `V9c` and `V9f` independently each see the snapshot/restore window in their own leaf's Adds, so they either build it twice (two divergent implementations of the same `pi.setActiveTools` swap) or each assume the other owns it and neither builds the complete sequence. `V9f`'s PIC-8/PIC-19 tests assert behaviour on step 4 and steps 1–2 of the PIC-17 sequence, but with no `Deps` edge to `V9c` the `V9f` implementation must itself materialise the whole window to exercise those step boundaries — silently re-establishing the duplicate the plan failed to prevent.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e (2026-06-10) "pi-loom plan: build/update plan for spec.md + review"
**History:** Both halves of the split were authored together in the inaugural plan-build commit `c6a664e`. `git log -S` confirms the `PIC-17` token in `V9c-conversation-drive.md`, the "snapshot/restore on the prompt path" phrase in `V9f-tool-registration-lifetime.md`, and the `PIC-17, PIC-18 | V9c` coverage-matrix row were all introduced in that single commit; the only later commits touching `V9c-conversation-drive.md` (`2ce483b`, `ecedd5f`) resolved unrelated findings and did not touch the snapshot/restore ownership. The ownership split is original to the plan, not introduced by a later edit.

## Solution Space

**Shape:** single

### Recommendation

Make `V9f` the sole owner of the PIC-17 active-set allowlist gating window, co-located with the PIC-8/PIC-19 step-keyed failure protocols it already owns and the `tool-registration-lifetime.md` page it already cites; reduce `V9c` to a consumer of that seam.

- In `docs/plan_topics/V9f-tool-registration-lifetime.md`: keep the existing "snapshot/restore on the prompt path" phrasing in **Adds** and make it the normative description of the PIC-17 four-step window (snapshot → `setActiveTools` → query → `finally`-restore; ambient tools not inherited). Add a `PIC-17` bullet to **Tests** asserting the window snapshots active tools, sets the loom callable set, and restores in `finally` with ambient tools not inherited.
- In `docs/plan_topics/V9f-T-tool-registration-lifetime.md`: add the matching `PIC-17` failing-test bullet.
- In `docs/plan_topics/V9c-conversation-drive.md`: strike the `PIC-17` **Tests** bullet, and reword the **Adds** clause "the active-set gating window (snapshot → `setActiveTools` → query → `finally` restore; ambient tools not inherited)" to state that the prompt-mode driver invokes `V9f`'s active-set gating seam around each query rather than enumerating the steps. Add `V9f` to **Deps**. Leave the `PIC-2` cross-body non-overlap bullet on `V9c`.
- In `docs/plan_topics/V9c-T-conversation-drive.md`: strike the `PIC-17` **Tests** bullet and add `V9f` to **Deps**.
- In `docs/plan_topics/coverage-matrix.md`: move `PIC-17` off the `PIC-17, PIC-18 | V9c` row to `V9f` (leaving `PIC-18 | V9c`), so the PIC-17 closing leaf matches its owner.

Edge cases for the implementer: confirm the added `V9f` → `V9c` Deps edge stays acyclic (`V9f` Deps `V9f-T, V9a, V5d` do not reach `V9c`); and keep `V9c`'s `Ships when` ("asserts the active-set snapshot/restore") consistent by phrasing it as exercising `V9f`'s seam end-to-end rather than asserting the window's internals.

## Relationships

- T23 "Prompt-mode failure-path and short-circuit ordering have no asserting test" — same-cluster (same V9c leaf; independent of the window ownership)
- T33 "V15a omits the Pi behavioural preconditions its prompt→prompt snapshot/restore depends on" — decision-overlap (resolving which leaf canonically owns the snapshot/restore protocol determines the correct Deps target for V15a's companion edge)

---

# T25 — `loomPaths` entry-schema diagnostics (`settings-invalid-entry` / `invalid-extension`) are asserted by no leaf and mapped by no coverage row

**Original heading:** `loomPaths` entry-schema diagnostics have no owner with a gate
**Original section:** V10a — Discovery union and collision resolution
**Kind:** validation
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

The spec defines two error-severity load diagnostics for `loomPaths` array entries: `loom/load/settings-invalid-entry` (a non-string entry is rejected; the offending entry contributes no looms while siblings still process) and `loom/load/invalid-extension` (a file entry — or a glob match — whose path does not end in `.loom` is rejected per match). Both are normative in `spec_topics/diagnostics/code-registry-load.md` and in `spec_topics/discovery/package-and-settings.md` §`loomPaths` entry schema.

Neither code appears anywhere in the plan corpus. The `loomPaths` entry schema is the spec topic owned by `V10c` (its **Spec** field is `package-and-settings.md`, which contains the entry-schema section), yet `V10c` / `V10c-T` assert only `DISC-7`, `settings-invalid-json`, and the reload debounce — neither entry-schema code is named. `V10a` / `V10a-T` (discovery walk) cover `DISC-1`–`DISC-4` and reference the entry rules only by cross-link, also asserting neither code. As code-keyed obligations (no numbered `PREFIX-N` REQ-ID), both also require a row in the coverage matrix's *Code-keyed obligation areas* table so the closing gate can verify closure — there is no such row for `discovery/package-and-settings.md`'s entry-schema codes.

The result is a behaviour the spec mandates (reject malformed `loomPaths` entries, error severity, siblings continue) with no asserting test and no coverage-matrix gate. The closing gate cannot detect the omission because the obligation is absent from the matrix entirely.

## Plan Documents

- `docs/plan_topics/V10c-settings-merge.md` — Adds / Tests / Ships when (edited)
- `docs/plan_topics/V10c-T-settings-merge.md` — Tests (edited)
- `docs/plan_topics/coverage-matrix.md` — Code-keyed obligation areas table (edited)
- `docs/plan_topics/V10a-discovery-walk.md` — Adds (read-only; alternative owner considered and rejected)

## Spec Documents

- `docs/spec_topics/discovery/package-and-settings.md` — §`loomPaths` entry schema (read-only)
- `docs/spec_topics/diagnostics/code-registry-load.md` — `settings-invalid-entry` / `invalid-extension` rows (read-only)

(The codes already exist in the spec; the fix touches no spec file.)

## Affected Leaves

**Phases:** Vertical slices (V10 — Discovery and settings)

**Leaves (implementation order):**

- `V10c-T` — Settings reads and merge (tests) — (modified)
- `V10c` — Settings reads and merge — (modified)

## Consequence

**Severity:** correctness

Without an asserting bullet, the spec-mandated rejection of non-string `loomPaths` entries and non-`.loom` file/glob matches ships unverified — two reasonable implementers diverge, one emitting the errors and keeping siblings processing, the other silently dropping or processing the offending entries. With no coverage-matrix row for these code-keyed obligations, the H5a/H6a closing gate has nothing to check, so the omission passes the release gate vacuously.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e (`pi-loom plan: build/update plan for spec.md + review`, 2026-06-10)
**History:** The current plan corpus — including `V10a`/`V10c` and their `-T` partners — was authored wholesale in `c6a664e` (`git log --diff-filter=A` reports it as the creating commit for the V10a/V10c leaf files). `git log -S 'settings-invalid-entry'`, `-S 'invalid-extension'`, and `-S 'loomPaths'` over `plan_topics/` return only the pre-reset plan structure removed in `657ee76` ("reset to scaffold + template") and the doc-move commit `31ff060` — both predating the current leaves, and the tokens lived in the now-deleted `plan_topics/v14-tool-calls.md` of the old plan, never in the current V10 leaves. The assertion-and-mapping gap is original to the current plan, not introduced by a later edit.

## Solution Space

**Shape:** multiple

This finding carries two independent obligations — closure evidence in the leaf and a coverage-matrix mapping — that land on different files and cannot be resolved by one leaf edit. Both are required; resolve the matrix mapping first so the owning-leaf decision is fixed before any assertion is written.

### Obligation 1 — Map the code-keyed obligation in the coverage matrix

Add a row to the *Code-keyed obligation areas* table in `coverage-matrix.md` mapping `discovery/package-and-settings.md` §`loomPaths` entry schema (the `settings-invalid-entry` / `invalid-extension` codes) to `V10c` as its closing leaf — letting the H5a/H6a closing gate recognise and enforce closure of the obligation. The owning leaf is `V10c`, not `V10a`: the `loomPaths` entry schema is defined in `package-and-settings.md`, which is `V10c`'s **Spec** topic, and `V10c`'s Adds already claims "validation"; `V10a`'s spec topics only cross-reference the entry schema.

### Obligation 2 — Assert both codes in the `V10c` leaf pair

In `V10c-T` Tests (and mirrored in `V10c` Tests / Ships-when), add a bullet asserting a non-string `loomPaths` entry fires `loom/load/settings-invalid-entry` (severity `error`, non-fatal) and contributes no looms while sibling entries still process; and a bullet asserting a file entry — and a glob match (e.g. `foo*` resolving to `foo.md`) — whose path does not end in `.loom` fires `loom/load/invalid-extension` per offending match while siblings continue.

Edge cases the implementer must watch: both codes are severity `error` but non-fatal — sibling entries must keep processing; `invalid-extension` fires per glob match, not only per literal file entry; both messages carry the `loomPaths[<index>]` index.

## Relationships

- T27 "V10c claims settings validation in Adds but no test asserts `loom/load/settings-value-out-of-range`" — same-cluster (another `loom/load/*` settings code on `V10c`/`V10c-T` with no asserting bullet; resolves independently)

---

# T26 — V10b presents the operator-tunable package-walk bounds as hardcoded constants

**Original heading:** Bounded-walk limits hardcoded with no stated tuning escape
**Original section:** V10b — Package discovery (bounded walk)
**Kind:** risk
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V10b` Adds describes the bounded package walk as "(`maxFiles` 2000, `timeoutMs` 2000)" — two bare literals — and the `DISC-6` Tests bullet (in both `V10b` and `V10b-T`) names only "the `maxFiles`/`timeoutMs` bound". Nothing in the leaf records that these two numbers are *defaults*, nor that the bound is operator-adjustable.

The spec the leaf cites is explicit on the opposite point. `package-and-settings.md` §Package discovery (DISC-6) states the caps "are operator-tunable rather than hardcoded" because "monorepos and global-package-heavy setups can exceed the default caps", and that the walk stops once it has inspected `looms.scanPackagesMaxFiles` files (default `2000`) or spent `looms.scanPackagesTimeoutMs` ms (default `2000`). The same spec file enumerates `looms.scanPackagesMaxFiles` and `looms.scanPackagesTimeoutMs` as recognised settings keys (integer ≥ 1, each surfacing `loom/load/settings-value-out-of-range` on a bad value), plus a `looms.scanPackages: false` wholesale-disable. Those keys are read by `V10c` (the five-key settings reads), but `V10b` neither consumes the resolved values nor declares a dependency on the surface that produces them.

An implementer reading `V10b` literally would compile `2000`/`2000` in as constants and ship a leaf whose walk ignores the three `looms.scanPackages*` keys — silently dropping the spec's tunability obligation and its associated validation, with no gate to catch the omission.

## Plan Documents

- `docs/plan_topics/V10b-package-discovery.md` — Adds, Tests (DISC-6) (edited)
- `docs/plan_topics/V10b-T-package-discovery.md` — Tests (DISC-6) (edited)
- `docs/plan_topics/V10c-settings-merge.md` — Adds (the five-key settings reads) (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical (slice V10)

**Leaves (implementation order):**

- V10b-T — Package discovery (bounded walk) (tests) — modified
- V10b — Package discovery (bounded walk) — modified

## Consequence

**Severity:** correctness

The leaf as written produces a package walk with the caps baked in as constants, contradicting the spec's "operator-tunable rather than hardcoded" requirement and silently leaving `looms.scanPackagesMaxFiles` / `looms.scanPackagesTimeoutMs` / `looms.scanPackages` unimplemented. A large but legitimate package source is then cut off with no operator knob to relieve the pressure.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `docs/plan_topics/V10b-package-discovery.md` was first committed in c6a664e, and the `Adds` prose "(`maxFiles` 2000, `timeoutMs` 2000)" presenting the caps as bare literals is present verbatim in that initial commit (confirmed by `git log -S 'maxFiles\` 2000'`, which reports only c6a664e). The defect has existed since the leaf's inception and was not introduced by a later edit.

## Solution Space

**Shape:** single

### Recommendation

In `V10b` Adds, replace the bare "(`maxFiles` 2000, `timeoutMs` 2000)" with text stating that the walk's file-count and elapsed-time caps are the **defaults** of the operator-tunable `looms.scanPackagesMaxFiles` (default `2000`) and `looms.scanPackagesTimeoutMs` (default `2000`) settings keys, resolved from the merged settings, and that the walk is skipped wholesale when `looms.scanPackages` is `false` — citing `package-and-settings.md` §Package discovery / DISC-6 and the §Settings file reads "Keys read" list as the owning spec text. State the per-read deadline as `max(200, floor(looms.scanPackagesTimeoutMs / 10))` so the formula's symbol resolves to the named key.

`V10b` consumes resolved settings values it does not itself read; declare that dependency on the settings-merge surface that produces the `looms.scanPackages*` keys (owned by `V10c`) by adding the appropriate leaf ID to `V10b` (and `V10b-T`) Deps. Mirror the framing change in the `DISC-6` Tests bullet of both `V10b` and `V10b-T` so the bound under test is the resolved key value, not a literal.

Edge cases for the implementer: the `looms.scanPackagesMaxFiles` / `looms.scanPackagesTimeoutMs` acceptance set (integer ≥ 1) and the `settings-value-out-of-range` fallback-to-default behaviour are owned by `V10c`; `V10b` consumes the already-resolved value and need not re-validate. The `looms.scanPackages: false` disable removes the walk entirely (no `discovery-slow`/`package-read-timeout` can fire), so a tunability assertion must use the populated-walk path.

## Relationships

- T28 "V10c reads five settings keys but no test asserts the read values change behaviour" — decision-overlap (the `V10b` tuning-escape decision constrains how the operator-value assertion is framed)
- T27 "V10c claims settings validation in Adds but no test asserts `loom/load/settings-value-out-of-range`" — same-cluster (touches the same `looms.scanPackages*` keys in V10c; resolves independently)

---

# T27 — V10c claims settings validation in Adds but no test asserts `loom/load/settings-value-out-of-range`

**Original heading:** Settings-value-out-of-range validation claimed in Adds with no asserting bullet
**Original section:** V10c — Settings reads and merge
**Kind:** validation
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

`V10c` Adds lists "validation" as one of the settings-merge surfaces the leaf builds, and the spec it cites (`package-and-settings.md`) defines that validation concretely: every recognised `looms.*` scalar key whose JSON value fails its declared type/range (`binderModel` non-empty string; `scanPackages` boolean; `scanPackagesMaxFiles`/`scanPackagesTimeoutMs` integer ≥ 1; `null` out of range for all) is treated as absent and logs exactly one `loom/load/settings-value-out-of-range` (severity `error`, non-fatal) per offending key per file. The same diagnostic also fires once per malformed top-level key when `loomPaths` or `looms` is the wrong JSON type — and, per the spec, a malformed `looms` does **not** additionally log one diagnostic per nested `looms.*` key.

Neither `V10c` nor its paired tests leaf `V10c-T` asserts any of this. Their Tests bullets cover only `DISC-7` (deep-merge precedence), `loom/load/settings-invalid-json` (malformed JSON), and the `Clock`-driven reload debounce. The diagnostic code `loom/load/settings-value-out-of-range` appears nowhere in the plan corpus, and Ships-when names only "the deep-merge precedence and a malformed-settings diagnostic".

The validation behaviour is a Class-1 observable (a registered diagnostic code with a defined emission count and an absent-fallback consequence), yet no red test pins it. An implementer can ship `V10c` green without implementing scalar-key or top-level-shape validation at all.

## Plan Documents

- `docs/plan_topics/V10c-T-settings-merge.md` — Tests (edited)
- `docs/plan_topics/V10c-settings-merge.md` — Tests, Ships when (edited)

## Spec Documents

- `docs/spec_topics/discovery/package-and-settings.md` — Settings file reads §Scalar-key validation, §Top-level shape validation (read-only)

## Affected Leaves

**Phases:** Vertical slice V10

**Leaves (implementation order):**

- `V10c-T` — Settings reads and merge (tests) — (modified)
- `V10c` — Settings reads and merge — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers would diverge: one wires up `loom/load/settings-value-out-of-range` for the four scalar keys and the two top-level keys, another ships `V10c` green having implemented none of it, since no test exercises the path. The settings-value-out-of-range obligation can silently ship unimplemented — the absent-fallback safety behaviour (built-in defaults applied on a bad value) goes unverified.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** `c6a664e` (2026-06-10, "pi-loom plan: build/update plan for spec.md + review") — authored both `V10c` and `V10c-T`.
**History:** `git log -S 'settings-value-out-of-range' -- docs/plan_topics/` returns no commits — the token has never appeared anywhere in the plan corpus. `V10c-T` at its creation commit `c6a664e` carried Tests bullets for `DISC-7` and a malformed-settings/debounce assertion only; subsequent edits to the leaf pair (`3a02fc7`, `2dc65d0`, `49e3837`, `66acde6`, `b2d5a1f`) reworked the malformed-JSON and reload-debounce/ERR-7 bullets but never added a `settings-value-out-of-range` assertion. The spec obligation predates the leaf: scalar-key validation existed before `c6a664e`, and the top-level-shape rule was added on `4c00462` (2026-06-06), four days before the leaf was authored. The coverage was therefore never written, not lost.

## Solution Space

**Shape:** single

### Recommendation

Add the asserting tests to `V10c-T`'s **Tests** field (the red-test owner of the pair) and mirror them in `V10c`'s **Tests** field, then extend `V10c`'s **Ships when** to name them. Cover both surfaces the spec defines:

- A scalar-key bullet: for each of `looms.binderModel`, `looms.scanPackages`, `looms.scanPackagesMaxFiles`, `looms.scanPackagesTimeoutMs`, a value that violates its acceptance set (e.g. `scanPackagesMaxFiles: 0`, `scanPackages: "yes"`, `binderModel: ""`, any `null`) emits exactly one `loom/load/settings-value-out-of-range` (severity `error`, non-fatal) and the key falls back to its absent-behaviour (built-in default, or the `bind_model:` resolution fallback for `binderModel`).
- A top-level-shape bullet: a wrong-JSON-type `loomPaths` or `looms` emits exactly one `loom/load/settings-value-out-of-range` per malformed top-level key per file and is treated as absent, and a malformed `looms` does **not** additionally emit one diagnostic per nested `looms.*` key.

Both bullets should assert the per-file scope (a malformed value in one file does not suppress a valid value of the same key in the other). The integer-ness rule (`2000.0` accepted, `25.5` rejected) is a per-key edge the scalar-key bullet should witness for the two integer keys.

## Relationships

- T28 "V10c reads five settings keys but no test asserts the read values change behaviour" — same-cluster (same `V10c` leaf, both add missing `V10c-T` assertions; resolve independently)
- T25 "`loomPaths` entry-schema diagnostics are asserted by no leaf and mapped by no coverage row" — same-cluster (another `loom/load/*` settings code on `V10c`; resolves independently)

---

# T28 — V10c reads five settings keys but no test asserts the read values change behaviour

**Original heading:** Five settings keys "read" but key application not asserted
**Original section:** V10c — Settings reads and merge
**Kind:** validation
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

`V10c` reads the five loom-extension settings keys defined in `package-and-settings.md` §"Keys read" — `loomPaths`, `looms.binderModel`, `looms.scanPackages`, `looms.scanPackagesMaxFiles`, and `looms.scanPackagesTimeoutMs` — and its Tests block asserts only that the values are *parsed and merged* correctly: `DISC-7` covers deep-merge precedence, `loom/load/settings-invalid-json` covers a malformed file, and the reload-debounce bullet covers coalescing. No bullet asserts that a read value subsequently *changes observable behaviour*.

The behavioural effect of each key is owned by a different consumer leaf, and none of those consumers asserts that the value it acts on is the one `V10c` merged from settings:

- `looms.scanPackages: false` must skip the package-discovery walk wholesale (zero candidate `package.json` reads), but `V10b`'s `DISC-6` bullet exercises only the bounded-walk trip points, never the disable path.
- Operator-tuned `looms.scanPackagesMaxFiles` / `looms.scanPackagesTimeoutMs` must move the `loom/load/discovery-slow` trip point; `V10b`'s `DISC-6` test fires at "the `maxFiles`/`timeoutMs` bound" with the hardcoded `2000` defaults from `V10b` Adds, so an implementation that ignores the settings value and uses constants would still pass.
- `loomPaths` must contribute additional looms through the Settings discovery source (`V10a`), and `looms.binderModel` must serve as the binder-model fallback when frontmatter `bind_model:` is omitted (`V11a`); neither application is asserted against a settings-sourced value.

The keys are therefore validated as data but never as behaviour. There is no test edge that fails if the value `V10c` reads never reaches the code that consumes it.

## Plan Documents

- `docs/plan_topics/V10c-settings-merge.md` — Adds / Tests (read-only)
- `docs/plan_topics/V10b-package-discovery.md` — Adds / Tests / Deps (edited)
- `docs/plan_topics/V10b-T-package-discovery.md` — Tests (edited)
- `docs/plan_topics/V10a-discovery-walk.md` — Tests (option-dependent)
- `docs/plan_topics/V10a-T-discovery-walk.md` — Tests (option-dependent)
- `docs/plan_topics/V11a-binder-model-resolution.md` — Tests (option-dependent)
- `docs/plan_topics/coverage-matrix.md` — DISC rows (read-only)

## Spec Documents

- `docs/spec_topics/discovery/package-and-settings.md` — §DISC-6, §DISC-7, "Keys read" (read-only)

## Affected Leaves

**Phases:** Vertical slices (V10, V11)

**Leaves (implementation order):**

- `V10a` — Discovery walk, sources, and collisions — (modified)
- `V10b` — Package discovery (bounded walk) — (modified)
- `V10c` — Settings reads and merge — (modified)
- `V11a` — Binder-model resolution and strict-capability probe — (modified)

## Consequence

**Severity:** correctness

An implementer can satisfy every `V10b`/`V10c` gate while wiring none of the settings keys to behaviour — hardcoding `V10b`'s `2000` bounds, ignoring `scanPackages: false`, and never plumbing `loomPaths`/`binderModel` into their consumers — and ship a build where operator-tuned settings are silently inert. Two reasonable implementers diverge on whether the read value is even consumed, and the divergent build matches the parse/merge tests but not the spec's behavioural contract.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e (2026-06-10) — "pi-loom plan: build/update plan for spec.md + review"
**History:** `V10c`'s Tests block has, since the leaf was first authored in c6a664e, covered only `DISC-7` deep-merge, the malformed-settings diagnostic, and the reload debounce; no bullet ever asserted that a read settings value changes downstream behaviour. `git log -S 'scanPackages' -- docs/plan_topics/V10c-settings-merge.md` returns empty — the token has never appeared in the leaf. The five later commits that touched the file (3a02fc7, 2dc65d0, 49e3837, 66acde6, b2d5a1f) refined only the debounce / `ERR-7` watcher-reload bullets and never added an application assertion. The gap is original to the plan authoring, not introduced by a later edit.

## Solution Space

**Shape:** single

### Recommendation

Add a behavioural-application assertion for each settings key at the consumer leaf that owns the observed behaviour, so each assertion exercises a value flowing from `V10c`'s merged settings into the consumer rather than a hardcoded constant. Land each failing bullet in the consumer's `-T` tests leaf and mirror it in the implementation leaf, per the tests-task pairing convention.

- `V10b-T` / `V10b` (`DISC-6` surface): assert that with merged settings `looms.scanPackages: false` the package walk performs zero candidate `package.json` reads (walk skipped wholesale); assert that a merged `looms.scanPackagesMaxFiles` value distinct from the `2000` default trips `loom/load/discovery-slow` at that operator value, not at `2000`; assert the same for `looms.scanPackagesTimeoutMs` against its trip point.
- `V10a-T` / `V10a`: assert that a `loomPaths` entry supplied through merged settings contributes its `.loom` file(s) through the Settings discovery source.
- `V11a` (and its paired `-T`): assert that `looms.binderModel` is used as the binder-model fallback when a non-bypass loom's frontmatter `bind_model:` is omitted (per `package-and-settings.md` §"Keys read" → `looms.binderModel`).

Wiring the implementer must watch: `V10b` currently lists `Deps. V10b-T, V10a, V8b` and does not name `V10c`, yet asserting that an operator-tuned bound moves the trip point requires the merged-settings value `V10c` produces. Either declare `V10b`'s dependency on the `V10c` settings read or route the value through an injected config the test can populate. The same producer→consumer reachability applies to `V10a` (for `loomPaths`) and `V11a` (for `binderModel`).

## Relationships

- T27 "V10c claims settings validation in Adds but no test asserts `loom/load/settings-value-out-of-range`" — same-cluster (same `V10c` leaf; both add validation bullets but resolve independently)
- T26 "V10b presents the operator-tunable package-walk bounds as hardcoded constants" — decision-overlap (the `V10b` tuning-escape decision constrains how the operator-value assertion is framed)

---

# T29 — Watcher-time reload failure-injection seam under-specified and ungated

**Original heading:** Watcher-time reload failure-injection seam under-specified and ungated
**Original section:** V10c — Settings reads and merge
**Kind:** clarity, implementability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V10c`'s Adds declares ownership of the *settings-re-merge sub-arm* of the **watcher-time reload failure-injection seam** and calls it "the named test interface through which a synthetic settings-re-merge failure this debounce feeds is fed to the `loom-system-note` surfacing path." The seam is described by prose only: no concrete interface name, method name, or injection mechanism is given, so the phrase "the named test interface" names nothing. The describing sentence is also grammatically broken — "a synthetic settings-re-merge failure this debounce feeds is fed to …" collapses two clauses and leaves the input/output direction of the seam ambiguous (does the caller hand a failure to the seam, or does the seam produce one?).

The same seam is jointly owned by `V9b` (the `loom/runtime/registry-swap-failed` registry-swap arm and the `.loom`/`.warp` re-parse arm) and consumed by `V4e`, whose `ERR-7` Tests bullet injects "at the **watcher-time reload failure-injection seam**" without standing up a live watcher. `V4e` lists `V9b` and `V10c` in `Deps`, so the dependency edge exists — but because neither owning leaf pins a concrete identifier/method for the seam, the `V4e` author must independently invent the injection interface and hope it matches whatever the `V10c`/`V9b` implementers built. `V9b`'s parallel prose is direction-explicit ("a synthetic registry-swap failure … is fed to the `loom-system-note` surfacing path without standing up a live watcher"), so the cross-leaf contract is asymmetrically specified.

## Plan Documents

- `docs/plan_topics/V10c-settings-merge.md` — Adds (edited)
- `docs/plan_topics/V9b-registration-drain-state.md` — Adds (edited)
- `docs/plan_topics/V4e-pre-evaluation-failures.md` — Tests `ERR-7`, Deps (edited)
- `docs/plan_topics/V4e-T-pre-evaluation-failures.md` — Tests `ERR-7`, Deps (edited)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slices

**Leaves (implementation order):**

- V4e — Pre-evaluation failures — (modified)
- V4e-T — Pre-evaluation failures (tests) — (modified)
- V9b — Registration steps and drain-state contract — (modified)
- V10c — Settings reads and merge — (modified)

## Consequence

**Severity:** correctness

The `ERR-7` test author (`V4e`) and the seam owners (`V10c`/`V9b`) have no shared concrete contract to bind against, so two reasonable implementers will diverge on the seam's interface and method, and the garbled sentence leaves the injection direction itself ambiguous. The resulting `V4e` test may inject against an interface the owning leaves never exposed, or assert the wrong direction of data flow.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 66acde6 — pi-loom plan: resolve "ERR-7 test injects at an undefined channel seam" (2026-06-11, Thomas Andersen)
**History:** `V10c`'s Adds originally read only "the `ERR-7` watcher-reload failure surface this debounce feeds is asserted by `V4e`." Commit 66acde6, resolving a prior finding that `ERR-7` injected at an undefined channel seam, rewrote that clause into the "settings-re-merge sub-arm of the … failure-injection seam … the named test interface through which a synthetic settings-re-merge failure this debounce feeds is fed to the `loom-system-note` surfacing path" prose — introducing in one stroke both the "named test interface" claim with no concrete identifier and the garbled "a synthetic … failure this debounce feeds is fed to" sentence. A later commit (b2d5a1f, 2026-06-11) renamed the seam from "watcher-rebuild" to "watcher-time reload" but left the under-specification and the broken grammar intact.

## Solution Space

**Shape:** single

### Recommendation

In `V10c`'s Adds, replace the garbled "named test interface" clause with a concrete, direction-explicit seam contract: pick one identifier for the seam (an interface plus the method a caller invokes to inject a synthetic settings-re-merge failure), and state that a caller supplies the synthetic failure to that method and the seam routes it onto the `loom-system-note` surfacing path with `triggerTurn:false`, without standing up a live watcher. Repair the broken sentence so the subject/verb agree and the data-flow direction is unambiguous (caller → seam → `loom-system-note`), mirroring the already-clean phrasing in `V9b`'s Adds.

Use the *same* concrete identifier in `V9b`'s Adds for its registry-swap and `.loom`/`.warp` re-parse arms, so the jointly-owned seam has one canonical name across both owning leaves. Update the `ERR-7` Tests bullet (and `Deps` parenthetical) in `V4e` and `V4e-T` to reference that identifier rather than the bare prose name.

Edge cases for the implementer: keep the seam a test-only injection interface (it must not require a live file watcher); preserve the existing `Deps` edges (`V4e` → `V9b`, `V10c`); and ensure the chosen identifier honours the leaf-ID and seam-naming conventions in `conventions.md` §Leaf format (Class-2 seam named in `Adds.` and bound by a `Deps.`-listing consumer).

## Relationships

None

---

# T30 — AJV-on-`args` depth-walk fast-fail `<ajv-summary>` rendering has no asserting test

**Original heading:** AJV-on-`args` depth-walk fast-fail rendering not asserted
**Original section:** V11f — Binder cancellation, per-class retry budget, and failure-class taxonomy
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The binder failure-mode templates pin two distinct renderings for the `<ajv-summary>` placeholder of the *AJV validation of the binder's `args` failed* row (`binder/determinism-cancellation-failure.md`, §Failure-mode templates):

1. **Ordinary AJV-on-`args` failure** — AJV ran over the lowered `params` schema, and `<ajv-summary>` is the in-order concatenation of the `ValidationIssue` entries, each rendered `<path> <message>` and joined by the two-character separator `; ` (the `errorsText(errors, { separator: '; ' })` form).
2. **Depth-walk fast-fail sub-case** — the cross-ceiling sub-case where the depth walk fast-fails at the `params` boundary (ceiling #4 routed to ceiling #3 via CIO-1). Here AJV never runs and its `errors` array is empty; `<ajv-summary>` is instead synthesised from the depth-walk's single canonical `ValidationIssue` and rendered as `<JSON-Pointer> JSON document depth exceeds 5` — a single-issue form with **no `; ` separator** and a fixed canonical message, explicitly distinct from form 1.

The V11f / V11f-T Tests bullet covers only form 1: "the six failure templates render verbatim (`<provider>` = `Model.api`, `<ajv-summary>` = `<path> <message>` joined with `; `)". Form 2 — a separate, normatively-pinned code path with a different separator discipline and a different summary source (synthesised issue vs `errorsText`) — has no asserting bullet. A TDD author working the listed Tests would implement and verify only the joined form; an implementation that routed the depth-walk fast-fail through `errorsText` over the empty `errors` array (yielding empty or malformed summary text) would ship green against the leaf's gate.

## Plan Documents

- `docs/plan_topics/V11f-T-binder-retry-taxonomy.md` — Tests (edited)
- `docs/plan_topics/V11f-binder-retry-taxonomy.md` — Tests (edited)
- `docs/plan_topics/V5e-depth-enforcement.md` — Adds / Tests, depth-walk owner (read-only)

## Spec Documents

- `docs/spec_topics/binder/determinism-cancellation-failure.md` — §Failure-class taxonomy (AJV-on-`args` class) and §Failure-mode templates (Depth-walk fast-fail clause) (read-only)

## Affected Leaves

**Phases:** Vertical slices — V11 (Binder)

**Leaves (implementation order):**

- V11f-T — Binder cancellation, per-class retry budget, and failure taxonomy (tests) — (modified)
- V11f — Binder cancellation, per-class retry budget, and failure taxonomy — (modified)

## Consequence

**Severity:** correctness

A spec-pinned, operator-visible rendering (the single-issue `<JSON-Pointer> JSON document depth exceeds 5` form, no `; ` separator) for the depth-walk fast-fail sub-case has no test, so two reasonable implementers diverge: one synthesises the canonical issue, one feeds the empty AJV `errors` array through `errorsText` and emits a degraded or empty summary. The defect ships with `npm test` green because the leaf's gate only proves the joined multi-issue form.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e ("pi-loom plan: build/update plan for spec.md + review", 2026-06-10)
**History:** The V11f leaf was authored at c6a664e, the plan-build commit, with the `<ajv-summary>` Tests bullet covering only the `; `-joined multi-issue form (`git log -S 'ajv-summary'` and `git log -G 'joined with .; .'` over `docs/plan_topics/V11f-binder-retry-taxonomy.md` both first hit c6a664e). The spec's depth-walk fast-fail single-issue clause (`no '; ' separator`) already existed in `docs/spec_topics/binder/determinism-cancellation-failure.md` before the plan was built — its history traces back through f2a948b and the f5e89f4 size-cap split (2026-06-04), predating c6a664e (2026-06-10). The two later edits touching the leaf (d5dd4de cancellation-forwarding, e2b7e81 cross-ceiling interface) addressed other concerns and did not add the depth-walk rendering bullet. The omission has therefore been present since the leaf's inception against an already-pinned spec obligation.

## Solution Space

**Shape:** single

### Recommendation

Add one Tests bullet to `docs/plan_topics/V11f-T-binder-retry-taxonomy.md` and mirror it verbatim in `docs/plan_topics/V11f-binder-retry-taxonomy.md` (the paired tests/impl bullet lists are kept identical), asserting the depth-walk fast-fail rendering distinctly from the joined form. The bullet must assert: a binder `kind:"ok"` envelope whose `args` trip the depth-walk fast-fail at the `params` boundary renders the AJV-on-`args` failure-mode row with `<ajv-summary>` equal to the single canonical issue `<JSON-Pointer> JSON document depth exceeds 5` (single-issue form, no `; ` separator, `<JSON-Pointer>` the path to the first too-deep node), and that this is distinct from the multi-issue `errorsText`-joined form already covered. Cite the spec anchor `../spec_topics/binder/determinism-cancellation-failure.md` §Failure-mode templates (Depth-walk fast-fail clause) and the AJV-on-`args` class in §Failure-class taxonomy.

Edge cases the implementer must watch: AJV does not run at this site (the `errors` array is empty), so the summary is synthesised from the depth-walk `ValidationIssue` (`schema_keyword:"maxDepth"`, message `"JSON document depth exceeds 5"`), not from any AJV call; the assertion must confirm the synthesised path, not an `errorsText` traversal.

## Relationships

None

---

# T31 — Respond-repair follow-up turn templates have no asserting test

**Original heading:** Verbatim follow-up-turn templates unasserted
**Original section:** V13d — Query failure and repair
**Kind:** validation
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

`query-failure-and-repair.md` §"Follow-up turn templates (normative)" carries a verbatim emission contract: "Renderers MUST emit the surrounding template text verbatim; only the `<…>` placeholders are interpolated. Wording changes — including whitespace inside the template body — are spec-versioned breaking changes." The section pins the two non-`none` methodologies (`validator_error`, `schema_repeat`), the literal U+0060 backticks around `__loom_respond_<slug>`, the terminating U+000A after the `<schema-json>` interpolation, the `<schema-json>` = `JSON.stringify(schema, null, 2)` over the **lowered** response schema, and the rule that on a multi-attempt sequence each follow-up's `<ajv-summary>` reflects **only** the most-recent failed attempt (never a cumulative concatenation).

`V13d` is the closing leaf for the QRY code-keyed area that owns this obligation, and its **Adds** names "the `validator_error`/`schema_repeat` templates". But neither `V13d` nor its paired `V13d-T` has a Tests bullet that pins the rendered template bytes, the `<schema-json>` substitution, or the most-recent-attempt-only `<ajv-summary>` rule. The four existing Tests bullets cover attempt accounting, proximate-variant propagation, the context-overflow short-circuit, per-attempt budget, and `ERR-17` — none of them the template wording.

The obligation carries no numbered `PREFIX-N` REQ-ID and no `loom/...` diagnostics-registry code, so the registry-code↔asserting-test and REQ-ID-citation closing-gate surfaces cannot force its assertion. The un-anchored-MUST surface is satisfied vacuously: the QRY area is enumerated in `coverage-matrix.md` with `V13d` as a closing leaf, but the closing gate's recogniser is a best-effort `MUST`-token scan that only checks an enumerated closing leaf exists — it does not verify the leaf actually asserts the template bytes. An implementer can therefore ship `Adds`-described behaviour as descriptive-only prose (`Adds.` does not bind on its own per `conventions.md` §Leaf format) with all gates green.

## Plan Documents

- `docs/plan_topics/V13d-query-failure-repair.md` — Tests (edited)
- `docs/plan_topics/V13d-T-query-failure-repair.md` — Tests (edited)
- `docs/plan_topics/coverage-matrix.md` — Code-keyed obligation areas, QRY row (read-only)
- `docs/plan_topics/conventions.md` — §Leaf format / §REQ-ID discipline (read-only)

## Spec Documents

- `docs/spec_topics/query/query-failure-and-repair.md` — Follow-up turn templates (normative) (read-only)

## Affected Leaves

**Phases:** Vertical slices (V13)

**Leaves (implementation order):**

- `V13d-T` — Query failure and respond-repair (tests) — (modified)
- `V13d` — Query failure and respond-repair — (modified)

## Consequence

**Severity:** correctness

The verbatim template text — wording, internal whitespace, the trailing U+000A, the backticks — is a spec-versioned breaking contract that no mechanical gate exercises, so two implementers can ship divergent follow-up turn bodies and both pass CI including the closing gate. The most-recent-attempt-only `<ajv-summary>` rule can silently regress to a cumulative concatenation across attempts, and `<schema-json>` can be serialised over the source-Loom-type form instead of the lowered schema, with no red test to catch either.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e ("pi-loom plan: build/update plan for spec.md + review", 2026-06-10)
**History:** The `V13d` / `V13d-T` leaf pair was created in c6a664e — the initial plan build — with `Adds` naming the `validator_error`/`schema_repeat` templates but no Tests bullet asserting them; the gap has existed since the files first appeared. The only later edit to either file (8f9e160, 2026-06-10) added the `ERR-17` bullet, not a verbatim-template assertion. The spec's normative verbatim requirement predates the plan build: the "Follow-up turn templates (normative)" section and its "Renderers MUST emit … verbatim" rule were present in `docs/spec_topics/query/query-failure-and-repair.md` before 2026-06-10 (the terminal-newline / trailing-whitespace refinement landed in d083d70 on 2026-06-06). The defect is a present-since-inception plan gap, not a regression introduced by a later edit.

## Solution Space

**Shape:** single

### Recommendation

Add asserting Tests bullets to `V13d-T` (red, per the paired-task ritual) and the mirror bullets to `V13d`, citing the QRY code-keyed area and `query-failure-and-repair.md` §"Follow-up turn templates (normative)" the same way the existing QRY bullets cite the spec page (the obligation has no `PREFIX-N` / `loom/...` code to cite). The bullets must assert:

- Each non-`none` methodology renders its template body byte-for-byte for a known input — `validator_error` and `schema_repeat` — including the trailing U+000A after the `<schema-json>` interpolation and the literal backticks around `` `__loom_respond_<slug>` ``, with only the `<…>` placeholders interpolated and all other characters fixed.
- `<schema-json>` is `JSON.stringify(schema, null, 2)` over the **lowered** response schema (the JSON Schema handed to AJV), not the source-Loom-type form, and `<slug>` equals the slug of that lowered schema.
- On a 2-attempt sequence, the second follow-up's `<ajv-summary>` reflects only the most-recent failed attempt's `ValidationIssue` entries, not a cumulative concatenation across both attempts.

Source the expected `<ajv-summary>` ordering from the canonical `validation_errors` order (ERR-14) so the rendered-summary assertion stays consistent with the binder's `<ajv-summary>` rendering already pinned on `V11f`. Edge cases the implementer must watch: the `none` / `attempts: 0` case emits no follow-up (no template to assert); the synthesised-`ValidationIssue` path of forced-respond non-compliance (`ERR-17`) routes through the same template pipeline, so its rendered follow-up body is covered by the same template assertion.

## Relationships

None

---

# T32 — Code-side return-type mapping is named but never positively asserted in V14a

**Original heading:** Code-side return-type table positive mapping unasserted
**Original section:** V14a — Tool calls (code-side) and `CodeToolError`
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V14a` **Adds** lists "the return-type table" as one of the leaf's deliverables. The spec table it implements (`tool-calls.md` §*Return type*) has two rows: a Pi tool returns `Result<string, QueryError>`, and a registered subagent-mode `.loom` callable returns `Result<T, QueryError>` where `T` is the callee's inferred return type (same inference rule as `invoke<T>(...)`).

The leaf's **Tests** bullets, however, exercise only the *failure* arm of that mapping — the off-surface-outcomes bullet asserts that a non-conforming return routes to `internal-error{tool-return-shape}`. No bullet asserts the *positive* path: that a conforming Pi-tool return lowers to a `string`-typed loom value, and that a conforming subagent-mode `.loom` return lowers to its inferred-`T` typed value. `V14a-T` (the paired tests leaf) carries the identical Tests list, so the gap is present in the leaf that is supposed to land the red tests first, and `V14a` **Ships when** likewise names only the argument codes, the closed enum, the off-surface outcomes, the denial mapping, and the swallowing-handler suppression — not the return-type lowering.

A leaf can therefore satisfy every `npm test` assertion while implementing the return-type table incorrectly for accepted returns, because nothing observes the accepted-return → loom-value lowering.

## Plan Documents

- `docs/plan_topics/V14a-tool-calls.md` — Tests, Ships when (edited)
- `docs/plan_topics/V14a-T-tool-calls.md` — Tests (edited)

## Spec Documents

- `docs/spec_topics/tool-calls.md` — §Return type (read-only)

## Affected Leaves

**Phases:** Vertical (V14 — Tool calls)

**Leaves (implementation order):**

- `V14a-T` — Tool calls (code-side) and `CodeToolError` (tests) — (modified)
- `V14a` — Tool calls (code-side) and `CodeToolError` — (modified)

## Consequence

**Severity:** correctness

A thin implementation that fires `internal-error{tool-return-shape}` on malformed returns but mis-lowers accepted returns (wrong typed loom value for the Pi-tool `string` row or the subagent-mode inferred-`T` row) passes the whole V14a gate green. Two implementers can diverge on the accepted-return mapping with no test to catch it, shipping a leaf that does not match the spec's return-type table.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `git log --follow` over `docs/plan_topics/V14a-tool-calls.md` shows the leaf was authored in a single commit (c6a664e), the file's first and only commit. A pickaxe on `return-type table` and `tool-return-shape` confirms both the Adds mention and the failure-only Tests bullet entered in that same commit; the positive-mapping assertion was never present.

## Solution Space

**Shape:** single

### Recommendation

Add a positive return-type assertion to `V14a-T`'s **Tests** (and mirror it in `V14a`'s **Tests**), enumerating the two `tool-calls.md` §*Return type* rows and asserting each conforming return lowers to its specified loom value:

- a conforming **Pi tool** return lowers to a `Result<string, QueryError>` `Ok` carrying the tool's final output as a single `string`;
- a conforming **registered subagent-mode `.loom` callable** return lowers to a `Result<T, QueryError>` `Ok` whose payload is the callee's inferred return type `T` (statically-resolved inference per `invoke<T>(...)`; runtime AJV-enforced when not statically resolvable).

Extend `V14a` **Ships when** to name this positive-mapping assertion alongside the existing argument-code, enum, off-surface-outcome, denial-mapping, and swallowing-handler clauses, so the gate observes the accepted-return path and not only the `internal-error{tool-return-shape}` reject path.

## Relationships

None

---

# T33 — V15a omits the Pi behavioural preconditions its prompt→prompt snapshot/restore depends on

**Original heading:** Prompt→prompt suspend presupposes Pi `setActiveTools` atomicity + serial dispatch
**Original section:** V15a — Invocation core
**Kind:** assumptions
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V15a` declares (in its **Adds** field) "the prompt→prompt parent-suspend with the `setActiveTools` snapshot/restore" and its **Ships when** spawns an invoke across the cross-mode matrix. The safety of that whole-body snapshot/restore window rests on two Pi *behavioural* preconditions: (a) the runtime may treat `pi.setActiveTools(string[])` as synchronous-and-atomic on the JS event loop, and (b) Pi serialises slash-command dispatch per session so two loom-invocation dispatches against the same session cannot overlap their snapshot/restore windows.

`invocation.md` (Cross-mode semantics) does not state those guarantees itself — it defers: the prompt→prompt protocol "rests on the same two Pi guarantees ... pinned there", where "there" is the Pi Integration Contract tool-registration-lifetime page (`spec_topics/pi-integration-contract/tool-registration-lifetime.md`, anchor `#snapshot-restore-pi-behavioural-preconditions`). That page is the sole owner of the two preconditions, the restore-/install-failure protocols (PIC-8 / PIC-19), and the defensive recovery-mutex path that applies if either precondition weakens.

`V15a`'s **Spec** field lists `invocation.md`, `discovery-sources.md`, `cancellation.md`, `return.md`, and `implementation-notes.md` — but not the PIC tool-registration-lifetime page; and its **Deps** (`V15a-T`, `V10a`, `V2b`, `V3d`, `V8a`) omit `V9f`, the leaf that owns that page and builds the registration-cache / active-set machinery the whole-body snapshot/restore reuses. Per the plan's How-to-use step 3 an implementer reads only the leaf and the spec topics in its **Spec** field, so a `V15a` implementer working from the listed pages never encounters the preconditions the snapshot/restore window depends on.

## Plan Documents

- `docs/plan_topics/V15a-invocation-core.md` — Spec field and Deps (edited)
- `docs/plan_topics/V9f-tool-registration-lifetime.md` — owner of the PIC tool-registration-lifetime page and the snapshot/restore machinery (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md` — `#snapshot-restore-pi-behavioural-preconditions` (the two behavioural preconditions, PIC-8/PIC-19, recovery-mutex) (read-only)
- `docs/spec_topics/invocation.md` — Cross-mode semantics (the prompt→prompt suspend paragraph that defers to the PIC page) (read-only)

## Affected Leaves

**Phases:** Vertical — V15 (Invocation and imports)

**Leaves (implementation order):**

- `V15a` — Invocation core — (modified)

## Consequence

**Severity:** correctness

A `V15a` implementer working from only the cited pages never sees that the snapshot/restore window's safety rests on synchronous-atomic `pi.setActiveTools` and per-session serial slash dispatch, nor the recovery-mutex fallback if either weakens. Two reasonable implementers would diverge — one assuming the window needs no concurrency guard, another inventing an ad-hoc lock — and the resulting whole-body snapshot/restore may not match the precondition contract the spec actually pins.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `V15a` was authored in its first commit with "the prompt→prompt parent-suspend with the `setActiveTools` snapshot/restore" already in its **Adds** field but a **Spec** field listing only `invocation.md` and `discovery-sources.md` (and **Deps** without `V9f`). A pickaxe for `pi-integration-contract` over the leaf's history returns no commit, confirming the PIC tool-registration-lifetime page was never cited; the four later edits to the leaf touched unrelated fields. The omission therefore exists in the leaf's inaugural commit.

## Solution Space

**Shape:** single

### Recommendation

Add the PIC tool-registration-lifetime page to `V15a`'s **Spec** field so the two behavioural preconditions become visible to the implementer. Insert a citation to `../spec_topics/pi-integration-contract/tool-registration-lifetime.md` (anchor `#snapshot-restore-pi-behavioural-preconditions`) into the existing **Spec.** list in `docs/plan_topics/V15a-invocation-core.md`.

Companion edit on the same leaf: add `V9f` to `V15a`'s **Deps** (`V15a-T`, `V10a`, `V2b`, `V3d`, `V8a` → also `V9f`). `V15a`'s whole-body snapshot/restore is the per-query protocol from `V9f` generalised to the child's whole body and reuses `V9f`'s registration-cache and active-set swap machinery, so `V15a` must sequence after `V9f`; the Spec-field citation alone surfaces the preconditions but does not establish that build order.

Edge case: if the companion "Leaf too large" finding splits `V15a`, both the Spec citation and the `V9f` Deps edge land on whichever sub-leaf carries the prompt→prompt parent-suspend (the proposed dispatch+suspend leaf), not on the load-infrastructure or diagnostics leaves.

## Relationships

- T45 "V15a bundles seven independently-shippable units across five spec topics" — must-follow (if V15a is split, this Spec-citation + Deps edge attaches to the dispatch+suspend sub-leaf that carries the parent-suspend; settle the split shape first)
- T24 "PIC-17 active-set snapshot/restore window owned by both V9c and V9f" — decision-overlap (resolving which leaf canonically owns the snapshot/restore protocol determines the correct Deps target for V15a's companion edge)

---

# T34 — `loom/parse/import-non-warp-extension` has no asserting test

**Original heading:** `loom/parse/import-non-warp-extension` has no asserting test
**Original section:** V15c — Imports and re-exports
**Kind:** validation
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

`imports.md` defines six diagnostic codes that the imports leaf must close: `loom/parse/warp-top-level-statement`, `loom/parse/import-non-warp-extension`, `loom/load/unresolvable-warp-path` (IMP-1), `loom/parse/import-unknown-symbol`, `loom/parse/import-name-collision`, and `loom/load/import-cycle`. `V15c-T` and its paired `V15c` implementation leaf assert five of these (unresolvable-warp-path, warp-top-level-statement, import-cycle, import-unknown-symbol, import-name-collision) but never assert `loom/parse/import-non-warp-extension`. A corpus search confirms the code appears in no plan leaf at all.

Per `imports.md` §Path resolution, `import-non-warp-extension` is the parse error for an `import` path literal whose value does not end in `.warp` — including a `.loom` path or any non-lowercase variant such as `.WARP` (the extension match is byte-exact lowercase). This is an import-specific obligation distinct from the lexical path-literal codes owned by `V1b` (`invalid-path-separator`, the byte-exact `.LOOM` rejection); `V1b-T` asserts those but does not name `import-non-warp-extension`, so ownership of this code is unambiguously the imports leaf `V15c`, not `V1b` or `V2a`.

Because the code is a registered `loom/parse/*` diagnostic with no asserting test, `H5a`'s registry-code↔asserting-test reconciliation arm has nothing to match it against. On the live-corpus footing that binds once `H6a` activates, that arm reddens CI. Independently, the non-`.warp` import rejection behaviour ships unverified: two implementers following `V15c-T` as written would both omit it, producing a leaf that does not satisfy the spec's six-code obligation.

## Plan Documents

- `docs/plan_topics/V15c-T-imports.md` — Tests (edited)
- `docs/plan_topics/V15c-imports.md` — Tests / Ships when (edited)
- `docs/plan_topics/coverage-matrix.md` — Code-keyed obligation areas (option-dependent)
- `docs/plan_topics/H5a-closing-gate-automation.md` — registry-code↔asserting-test reconciliation arm (read-only)
- `docs/plan_topics/V1b-T-literals-and-paths.md` — path-literal lexical codes (read-only; confirms non-ownership)

## Spec Documents

None — the fix is internal to plan files; `imports.md` already defines `import-non-warp-extension` and is read first-hand only as the authority.

## Affected Leaves

**Phases:** Vertical slices (V15)

**Leaves (implementation order):**

- `V15c-T` — Imports (`.warp` library files) (tests) — (modified)
- `V15c` — Imports (`.warp` library files) — (modified)

## Consequence

**Severity:** correctness

A reasonable implementer following `V15c-T` produces an imports leaf that asserts five of the spec's six import diagnostic codes and silently omits the non-`.warp` import-path rejection, so that behaviour ships unverified. The registered `loom/parse/import-non-warp-extension` code then has no asserting test, and `H5a`'s registry-code↔asserting-test reconciliation arm reddens CI on the live-corpus footing once `H6a` activates the release gate.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e
**History:** `docs/plan_topics/V15c-imports.md` and `docs/plan_topics/V15c-T-imports.md` were both added (status A) in `c6a664e` ("pi-loom plan: build/update plan for spec.md + review"), the single commit that built the current plan corpus after the prior reset-to-scaffold (`657ee76`). Both leaves enumerated five of `imports.md`'s six diagnostic codes from the outset and never asserted `loom/parse/import-non-warp-extension`; `git log -S 'import-non-warp-extension' -- docs/` returns only spec-side commits, confirming the token never appeared in any plan leaf. The omission is original to the leaf, not introduced by a later edit.

## Solution Space

**Shape:** single

### Recommendation

Add the missing assertion to the imports leaf pair, keyed on the `import-non-warp-extension` code:

- In `docs/plan_topics/V15c-T-imports.md` **Tests**, add a bullet asserting that an `import` whose path literal does not end in byte-exact lowercase `.warp` fires `loom/parse/import-non-warp-extension`. Cover at least a `.loom`-suffixed path and a non-lowercase `.WARP` variant, since the spec calls both out explicitly. This bullet must exist, compile, and fail red per the tests-task contract.
- Mirror the same assertion in `docs/plan_topics/V15c-imports.md` **Tests**, and extend its **Ships when** (currently "resolves a `.warp` import, rejects a non-permitted top-level form, and fires `import-cycle`") to also name the non-`.warp`-extension rejection so the gate condition covers it.

Ownership is `V15c`, not `V1b`/`V2a` — do not retarget the assertion there. Edge cases for the implementer: the rejection is a parse error keyed on the literal as written (the diagnostic renders the offending path per the `<path>` placeholder rule), and the byte-exact lowercase rule means `.WARP`/`.Warp` must reject on every host regardless of filesystem case-equivalence. The implementer may also add a parallel `imports.md` row mapping the import `loom/parse/*` / `loom/load/*` codes to `V15c` in `coverage-matrix.md`, but the gate-closing fix is the asserting test, not the matrix row.

## Relationships

- T35 "V15c asserts only import failure paths; auto-export and re-export success behaviour is unverified" — same-cluster (same `V15c` leaf; both add missing Tests bullets, resolve independently)
- T02 "Code-keyed obligation rows have no machine-matchable key, yet three closing-gate arms match cited tokens against them" — same-cluster (both concern coverage-matrix code-keyed-row representation of import/code-keyed obligations; resolve independently)

---

# T35 — V15c asserts only import failure paths; auto-export and re-export success behaviour is unverified

**Original heading:** Auto-export and re-export positive paths unasserted
**Original section:** V15c — Imports and re-exports
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

Every Tests bullet on `V15c` (and its paired `V15c-T`) drives a failure path: `IMP-1` unresolvable-path throw, `loom/parse/warp-top-level-statement`, `loom/load/import-cycle`, `import-unknown-symbol`, and `import-name-collision`. None of the success behaviours the import system is specified to produce is asserted.

`imports.md` defines several normative positive obligations that no test covers. Under **Visibility**, every top-level `schema`/`enum`/`fn` in a `.warp` file is implicitly exported and resolvable by a downstream importer. Under **Re-exports**, `export { A } from "./x.warp"` (and the `as`-aliased `export { A as B } from`) makes the symbol visible to downstream importers while creating no local binding, and — critically — a plain `import { A } from "./x.warp"` does **not** re-export `A` from the importing file. These are MUST-level distinctions, not incidental behaviour.

`V15c`'s `Ships when` ("`npm test` resolves a `.warp` import, rejects a non-permitted top-level form, and fires `import-cycle`") names only a coarse "resolves a .warp import" observable that does not pin the auto-export/re-export semantics. A thin implementation could fire every error code correctly, conflate the `import`-vs-`export … from` re-export distinction, and still pass the gate green.

## Plan Documents

- `docs/plan_topics/V15c-T-imports.md` — Tests (edited)
- `docs/plan_topics/V15c-imports.md` — Tests, Ships when (edited)
- `docs/plan_topics/conventions.md` — Leaf format / per-phase TDD ritual (read-only)
- `docs/plan_topics/coverage-matrix.md` — IMP-1 row (read-only)

## Spec Documents

- `docs/spec_topics/imports.md` — Visibility, Re-exports (read-only)

## Affected Leaves

**Phases:** Vertical slices (V15)

**Leaves (implementation order):**

- `V15c-T` — Imports (`.warp` library files) (tests) — (modified)
- `V15c` — Imports (`.warp` library files) — (modified)

## Consequence

**Severity:** correctness

The accepted-form behaviour (auto-export visibility, `export … from` re-export with no local binding, plain `import` not re-exported) is a normative MUST surface with no asserting test, so two reasonable implementers can diverge on the re-export-vs-import distinction and both ship the leaf green. A regression that breaks symbol visibility or leaks a plain `import` as a downstream re-export passes the existing gate undetected.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `git log --follow` on both `docs/plan_topics/V15c-imports.md` and `docs/plan_topics/V15c-T-imports.md` returns a single commit (c6a664e); both leaves were authored with failure-path-only Tests bullets in that first commit. No later edit added or removed positive-path assertions, so the validation gap has existed since the leaf entered the corpus.

## Solution Space

**Shape:** single

### Recommendation

Add positive-path assertions to the `V15c-T` Tests field (and mirror the same bullets in `V15c` Tests, per the paired `-T`/impl ritual), citing `imports.md` for each obligation:

- A downstream file resolves an auto-exported symbol: a top-level `schema`, `enum`, and `fn` declared in a `.warp` file are each visible to an importing file with no `export` keyword on the declaration (Visibility rule in `imports.md`).
- `export { A as B } from "./x.warp"` is visible to a downstream importer as `B`, with no local binding for `A` in the re-exporting file (Re-exports rule).
- A plain `import { A } from "./x.warp"` is **not** re-exported: a further downstream `import { A } from "<re-importing file>"` does not see `A` (the negative half of the Re-exports rule).
- A resolvable relative `.warp` import binds its symbols successfully (the `Resolver` success path, complementing the existing `IMP-1` throw test).

Tighten `V15c`'s `Ships when` so it names a positive observable — an auto-exported symbol resolving in a downstream file and an `export … from` re-export being visible — rather than the coarse "resolves a `.warp` import". These behaviours are already owned by `V15c`, so no coverage-matrix or spec edit is required.

## Relationships

- T34 "`loom/parse/import-non-warp-extension` has no asserting test" — same-cluster (sibling V15c validation gap; may land in the same Tests-field edit pass)
- T12 "V5a positive declaration-form parse has no asserting test" — same-cluster (identical "only error codes asserted, accepted forms untested" pattern; independent leaf)

---

# T36 — V16a over-claims that all CIO bullets are provable at the stateless arbitration seam in isolation

**Original heading:** Fixed cross-ceiling order not fully provable at the stateless seam in isolation
**Original section:** V16a — Hard-ceiling interaction order and `masked` co-fire
**Kind:** assumptions, placement
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V16a` models the cross-ceiling arbitration as a stateless single-candidate function `arbitrate(candidate) → { surfaced, masked? }`, and its Adds asserts that *all* CIO bullets "are exercised by driving synthesised ceiling-candidates through this seam in isolation"; the Ships-when repeats that the seam "proves … the CIO-1 … CIO-6 order … observable at `V16a`'s position without the downstream breach-site leaves." Two of the six CIO bullets are temporal cross-site relations that a stateless single-candidate function cannot witness:

- **CIO-1** (`ceilings-3-and-4.md#cio-1`) asserts ceiling #3 is *evaluated at slash-load time, before any runtime-class ceiling fires*. The seam can only decide precedence given a set of co-satisfied candidates (given #3 and a runtime-class candidate together, surface #3). It cannot observe that the #3 check actually occurs at load time and the runtime checks occur later — that temporal placement lives at the distinct check sites, not in the arbitration function.
- **CIO-5** (`ceilings-3-and-4.md#cio-5`) asserts ceiling #3 *never interleaves* with #1/#2/#4 — a property that derives from the binder running only at slash-load time and `invoke(...)` never invoking the binder (binder-bypass). A stateless function fed synthesised candidates has no execution timeline against which "never interleaves" could be observed; the V16a-T `CIO-5` bullet ("across synthesised candidate sequences, ceiling #3 never interleaves") reduces to a precedence assertion that does not witness the cross-site temporal claim.

The remaining bullets are genuinely seam-local: CIO-2/CIO-3/CIO-4 are within-site sub-check orderings the arbitration decision encodes, and CIO-6 (at-most-one-surfaced + `masked` enumeration) is a single-event property. The leaf does not state which CIO sub-properties the seam actually verifies versus which temporal cross-site relations are deferred to the downstream enforcement-site leaves (`V4e`/`V11f` at load time, `V5e`/`V13c`/`V15b` at their runtime first-enforcement points) and to the `H7a` integration run (which drives a live #3-vs-#2 co-occurrence and asserts CIO-5 order end-to-end). The blanket "all CIO bullets … in isolation" claim therefore mis-states coverage for CIO-1 and CIO-5.

## Plan Documents

- `docs/plan_topics/V16a-ceiling-order-masked.md` — Adds, Tests, Ships when (edited)
- `docs/plan_topics/V16a-T-ceiling-order-masked.md` — Tests (edited)
- `docs/plan_topics/H7a-integration-acceptance.md` — Convention (live CIO-5 co-occurrence assertion) (read-only)
- `docs/plan_topics/V4e-pre-evaluation-failures.md` — Adds / `ERR-16` (read-only)
- `docs/plan_topics/V11f-binder-retry-taxonomy.md` — Adds (read-only)
- `docs/plan_topics/V13c-query-tool-loop.md` — Adds (read-only)
- `docs/plan_topics/V15b-invoke-depth-cycle.md` — Adds (read-only)
- `docs/plan_topics/V5e-depth-enforcement.md` — Adds (read-only)

## Spec Documents

- `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md` — CIO-1 … CIO-6 definitions (`#cio-1`, `#cio-5`) (read-only)
- `docs/spec_topics/hard-ceilings/ceiling-invariants-and-audit.md` — worked consequences / cross-ceiling invariants (read-only)

## Affected Leaves

**Phases:** Vertical slices

**Leaves (implementation order):**

- `V16a` — Hard-ceiling interaction order and `masked` co-fire — (modified)
- `V16a-T` — Hard-ceiling interaction order and `masked` co-fire (tests) — (modified)

## Consequence

**Severity:** correctness

A test author reading the leaf treats CIO-1 and CIO-5 as fully closed at the seam and writes precedence-only assertions, so the temporal cross-site relations (CIO-1's slash-load-before-runtime placement, CIO-5's never-interleaves) are claimed-closed but witnessed only incidentally — CIO-5 by `H7a`'s integration run, CIO-1's placement by the load-time-vs-runtime consult split — with no statement tying them to those witnesses. Two reasonable implementers diverge on whether the seam test discharges the full CIO-1/CIO-5 obligation, and the seam-level CIO-5 assertion is vacuous against the spec's cross-site claim.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** The blanket coverage claim that all CIO bullets are exercised "through the unit that computes the cross-ceiling order in isolation" was present in `V16a`'s first commit (c6a664e), alongside the temporal CIO-5 "never interleaves" bullet; the leaf never carved the temporal cross-site CIO-1/CIO-5 relations out of the in-isolation claim. A later edit (e2b7e81, "resolve 'isolated cross-ceiling unit interface/authority undefined'", 2026-06-10) sharpened the unit into a stateless single-candidate `arbitrate(candidate)` seam — making the gap more acute — but did not originate it. The over-claim has been continuously present since the file's creation.

## Solution Space

**Shape:** single

### Recommendation

In `V16a` Adds, replace the blanket "All CIO bullets are exercised by driving synthesised ceiling-candidates through this seam in isolation" claim with a statement that splits the CIO bullets by what the stateless single-candidate seam can actually witness:

- **Verified at the seam in isolation:** the cross-ceiling surfacing precedence given co-satisfied candidates (CIO-1's #3-over-runtime-class precedence *decision*, CIO-2/CIO-3/CIO-4 within-site sub-check ordering as encoded by the arbitration), the at-most-one-ceiling-per-event rule, and the `masked` co-fire enumeration (CIO-6).
- **Not witnessable at the stateless seam — owned by downstream sites:** CIO-1's *temporal* "ceiling #3 evaluated at slash-load before any runtime-class ceiling fires" (realised by the load-time consult in `V4e`/`V11f` versus the runtime first-enforcement consults in `V5e`/`V13c`/`V15b`), and CIO-5's "ceiling #3 never interleaves with #1/#2/#4" (a binder-bypass / load-time-only property whose end-to-end witness is `H7a`'s co-occurring-breach integration assertion).

Align the `V16a-T` and `V16a` `CIO-1` and `CIO-5` Tests bullets so they describe what the seam asserts — the precedence/arbitration decision over co-present candidates — rather than restating the temporal "evaluated at slash-load before runtime fires" / "never interleaves" wording as if the seam observes the live execution timeline. Cite `ceilings-3-and-4.md#cio-1` / `#cio-5` for the temporal relations and name the downstream/integration leaves (`V4e`, `V11f`, `V5e`, `V13c`, `V15b`, `H7a`) as their witnesses. The same edit resolves the placement angle (the synthesised-candidate test-execution-strategy paragraph currently in Adds is exactly the one carrying the over-broad claim).

## Relationships

None

---

# T37 — `V17a` / `V17a-T` omit `H4a` from Deps despite requiring its harness and response-programming surface

**Original heading:** `V17a`/`V17a-T` omit the H4a harness from Deps though their tests require it
**Original section:** V17a — Cancellation core
**Kind:** implementability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V17a-T`'s tests drive cancellation through the three entry points — slash-command, tool-exposed, and `invoke`-parent — to assert forwarding into `loomAbort`, and they inject aborts at chosen points (pre-call, in-flight provider call, budgeted retry) to exercise the checkpoint-granularity and reason-propagation vectors. Driving those entry points end-to-end and scripting abort injection is exactly what `H4a`'s end-to-end harness and shared **response-programming surface** provide; `H4a`'s injection-point category (e) explicitly names "the `V11f` / `V17a` vectors", and `H4a`'s Adds lists `V17a` in the closed set of harness-driven leaves that "consume … one API rather than inventing a per-leaf surface".

Despite that contract, `V17a` declares `Deps. V17a-T, V8a, V4d` and `V17a-T` declares `Deps. V8a, V4d` — neither names `H4a`. An implementer picking up `V17a-T` by its declared Deps has no edge to the harness and would build an ad-hoc cancellation drive, diverging from the single shared scripting contract `H4a` is designed to centralise. The `V8a` Checkpoint-seam edge alone covers abort-landing at a checkpoint but not the end-to-end forwarding-path drive the three-entry-point tests require.

## Plan Documents

- `docs/plan_topics/V17a-cancellation-core.md` — Deps field (edited)
- `docs/plan_topics/V17a-T-cancellation-core.md` — Deps field (edited)
- `docs/plan_topics/H4a-factory-shell-and-harness.md` — Adds (response-programming surface consumer list) (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical (V17 — Cancellation)

**Leaves (implementation order):**

- `V17a-T` — Cancellation core (tests) — (modified)
- `V17a` — Cancellation core — (modified)

## Consequence

**Severity:** correctness

The `V17a-T` red tests cannot drive the three forwarding entry points or script abort injection without the `H4a` harness, but no Deps edge declares it; two reasonable implementers would diverge — one waits for `H4a`, another builds an ad-hoc harness that drifts from the shared response-programming-surface contract `H4a` centralises, defeating the single-scripting-API guarantee `H4a` exists to enforce.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `V17a`'s first commit (c6a664e) already declared `Deps. V17a-T, V8a`, omitting `H4a`; the omission was never introduced by a later change. A later edit (a12e8b2, 2026-06-11) added `V4d` to the Deps but still did not add `H4a`, and 27e12be (2026-06-10) added `H4a`'s response-programming-surface consumer list naming `V17a` — making the missing dependency edge explicit — yet the `V17a` / `V17a-T` side has lacked the `H4a` edge since inception.

## Solution Space

**Shape:** single

### Recommendation

Add `H4a` to the Deps of both leaves so the harness edge the cancellation tests require is declared:

- In `docs/plan_topics/V17a-T-cancellation-core.md`, change the Deps field from `` `V8a`, `V4d` `` to add `` `H4a` `` (e.g. `` `V8a`, `V4d`, `H4a` ``).
- In `docs/plan_topics/V17a-cancellation-core.md`, change the Deps field from `` `V17a-T`, `V8a`, `V4d` `` to add `` `H4a` `` (e.g. `` `V17a-T`, `V8a`, `V4d`, `H4a` ``).

The three-entry-point forwarding tests and the abort-injection vectors are driven through `H4a`'s shared response-programming surface (injection-point category (e)), not through a per-leaf harness. Edge case the implementer must watch: if a future `H4a` split moves the response-programming surface into a new leaf, the Deps edge added here must target whichever leaf then owns that surface, not `H4a`'s residual factory-shell leaf.

## Relationships

- T38 "Forwarding-listener throw-trap contract has no asserting test in V17a" — must-precede (the throw-injection test must be driven through H4a's response-programming surface across the three entry points; resolving this Deps gap supplies the wiring that test needs)

---

# T38 — Forwarding-listener throw-trap contract has no asserting test in V17a

**Original heading:** Forwarding-listener throw-trap behaviour unasserted
**Original section:** V17a — Cancellation core
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`cancellation.md` (*Forwarding-listener throw*) defines a behavioural contract for the three steady-state forwarding listeners that `V17a` constructs: a throw from a listener's `loomAbort.abort(source.reason)` call — for the slash-command `ctx.signal`-aborted trigger, the tool-exposed `signal`-aborted trigger, or the `invoke`-parent derived-controller trigger — MUST be trapped at the listener boundary and routed through the runtime-defect surface on the `loom/runtime/internal-error` channel, with the `cause: "internal_error"` arm of `InvokeInfraError` at an `invoke` parent. The same clause states a non-swallow obligation: the trap MUST NOT absorb the cancellation itself, so `source.signal.aborted` is unchanged and the next `Checkpoint`-seam await still surfaces `Err(QueryError { kind: "cancelled" })`.

`V17a` adds all three forwarding listeners (its Adds bullet wires `ctx.signal`, the tool-exposed `signal`, and the parent-`invoke` signal into `loomAbort`), but neither `V17a` nor `V17a-T` carries any test bullet that injects a throw from a forwarding listener and asserts this trap-and-don't-swallow contract. The existing test bullets cover CNCL-1..6, forwarding into `loomAbort`, downward-only propagation, swallowing-handler suppression, checkpoint granularity, and loop-iteration yield — none of which exercises the defect path where the `abort()` invocation itself throws.

The contract is fully specified upstream; this is a plan-side coverage gap against an existing spec rule, not a spec defect.

## Plan Documents

- `docs/plan_topics/V17a-cancellation-core.md` — Tests / Ships when (edited)
- `docs/plan_topics/V17a-T-cancellation-core.md` — Tests / Ships when (edited)
- `docs/plan_topics/coverage-matrix.md` — CNCL row block (read-only)
- `docs/plan_topics/V4b-runtime-panics.md` — Adds / Tests (read-only; owns the `loom/runtime/internal-error` runtime-defect surface the trap routes into)
- `docs/plan_topics/V15a-invocation-core.md` — Tests (read-only; owns the `InvokeInfraError` variants the invoke-parent arm uses)

## Spec Documents

- `docs/spec_topics/cancellation.md` — *Forwarding-listener throw* (read-only; the governing contract, already complete)

## Affected Leaves

**Phases:** V17 — Cancellation

**Leaves (implementation order):**

- `V17a-T` — Cancellation core (tests) — (modified)
- `V17a` — Cancellation core — (modified)

## Consequence

**Severity:** correctness

Without an asserting test, two reasonable implementers diverge on the listener body: one wraps `loomAbort.abort(...)` so a throw routes to `loom/runtime/internal-error` (and the `InvokeInfraError{cause:"internal_error"}` arm at an invoke parent) while leaving the source signal aborted; another lets the throw escape (surfacing as an unhandled rejection) or swallows it together with the cancellation, so the next checkpoint never surfaces `cancelled`. Either divergence ships a `V17a` that does not match the spec's *Forwarding-listener throw* clause, and the `V17a` red→green gate passes without detecting it.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** The `V17a` / `V17a-T` leaves were authored together in c6a664e and have never carried a forwarding-listener throw-trap test in any revision, while the spec's *Forwarding-listener throw* clause predates the plan (present in `cancellation.md` since the 2026-05-08 docs reorganisation, 31ff060). The coverage gap is therefore present in the leaf pair's first commit; later edits (52a6819, 319b277, dc56e9a, 75a9bcd) reshaped other cancellation test bullets but never added this one.

## Solution Space

**Shape:** single

### Recommendation

Add a test bullet to `V17a-T`'s **Tests** list (mirrored into `V17a`'s **Tests** list) asserting the *Forwarding-listener throw* contract from [`cancellation.md`](../spec_topics/cancellation.md): inject a throw from each of the three steady-state forwarding listeners' `loomAbort.abort(source.reason)` call — the slash-command `ctx.signal`-aborted trigger, the tool-exposed `signal`-aborted trigger, and the `invoke`-parent derived-controller trigger — and assert two facets:

1. the defect routes through the runtime-defect surface on `loom/runtime/internal-error` (and, at an `invoke` parent, surfaces via the `cause: "internal_error"` arm of `InvokeInfraError`);
2. the trap does not swallow the cancellation: `source.signal.aborted` remains `true` and the next `Checkpoint`-seam await (`V8a`) still surfaces `Err(QueryError { kind: "cancelled" })`.

Drive the injection through the entry-point harness so the throw is raised inside the real listener boundary rather than a bespoke double. Add the matching assertion to `V17a`'s **Ships when** clause (the throw-trap routing and the non-swallow check). Use the spec's canonical "runtime-defect surface" wording for the assertion target rather than coining a name. Edge cases the implementer must watch: the first-source-wins one-shot guard on `loomAbort.abort()` (a throw on a re-entrant second trigger must not re-stamp the reason); and the `session_shutdown` teardown-iteration path, which is governed by its own sub-step-2 swallow rule and is explicitly out of scope for this steady-state trap.

## Relationships

- T37 "`V17a` / `V17a-T` omit `H4a` from Deps despite requiring its harness and response-programming surface" — must-follow (the throw-injection test must be driven through H4a's response-programming surface; resolving the Deps gap supplies the wiring this test needs)

---

# T39 — `SHUTDOWN_AWAIT_CAP_MS` physical home contradicts the spec's pinned-constants-block placement

**Original heading:** `SHUTDOWN_AWAIT_CAP_MS` ownership contradicts the spec's pinned-constants-block placement
**Original section:** V17a — Cancellation core
**Kind:** assumptions
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

`V17a` (Cancellation core) declares `SHUTDOWN_AWAIT_CAP_MS = 2000` in its **Adds** as "the single loom-owned cancellation-runtime constant … the one declared source that `V9g`'s session-shutdown await cap and `V9i`'s subagent-disposal bound both consume — neither leaf redeclares it." That framing names the cancellation module as the constant's physical declaration site.

The spec contradicts this. `patch-skew-degradation.md` §`session_shutdown` sub-step 3 states: "The `SHUTDOWN_AWAIT_CAP_MS` constant lives in the same source-of-truth pinned-constants block as the Step 0 capability-probe constants so the build-time literal-read assertions can assert it." That pinned-constants block is the one `V9a` establishes (its **Adds** describes "the extension module's single source-of-truth pinned-constants block") and that `V18c` reaches with its build-time literal-read assertions. `V17a`'s **Deps** are `V17a-T, V8a, V4d` — they omit the block owner (`V9a`/`V18`) entirely.

So the plan and spec disagree on where the constant physically lives: `V17a` claims the cancellation module is "the one declared source," while the spec requires it in the capability-probe pinned-constants block precisely so the build-time literal-read assertion can read it. An implementer following `V17a` would place the literal in the cancellation module, out of reach of the spec-mandated literal-read assertion, or would declare it in two places.

## Plan Documents

- `docs/plan_topics/V17a-cancellation-core.md` — Adds (the `SHUTDOWN_AWAIT_CAP_MS` clause) + Deps (edited)
- `docs/plan_topics/V9a-capability-probe.md` — Adds (the single source-of-truth pinned-constants block) (option-dependent)
- `docs/plan_topics/V18c-version-bump-checklist.md` — Adds / Tests (the build-time literal-read assertion set) (option-dependent)
- `docs/plan_topics/coverage-matrix.md` — `session_shutdown` sub-step-3 settle-all row (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/patch-skew-degradation.md` — §`session_shutdown` sub-step 3 (read-only)
- `docs/spec_topics/pi-integration-contract/capability-probe.md` — Step-0 pinned-constants placement (read-only)

## Affected Leaves

**Phases:** Vertical slices (V9, V17, V18)

**Leaves (implementation order):**

- `V9a` — Capability probe (Step 0) — (modified)
- `V17a` — Cancellation core — (modified)
- `V18c` — Pi version-bump static gates — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge on the constant's physical home: one follows `V17a` and declares it in the cancellation module ("the one declared source"), the other follows the spec and places it in the capability-probe pinned-constants block. The spec-mandated build-time literal-read assertion can only reach the latter, so the `V17a`-directed placement leaves the assertion unable to read the literal (or forces a duplicate declaration), defeating the very gate the spec attaches to the constant.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 7ef443c — pi-loom plan: resolve "SHUTDOWN_AWAIT_CAP_MS has no declaring owner leaf" (2026-06-10, Thomas Andersen)
**History:** The spec's pinned-constants-block placement requirement has been present in `patch-skew-degradation.md` since the spec set's current form (f5e89f4, 2026-06-04). The contradicting plan framing entered later: commit 7ef443c (2026-06-10), itself a fix for a prior review finding that the constant had no declaring owner, assigned the constant a home in `V17a`'s Adds as "the single loom-owned cancellation-runtime constant / the one declared source" — choosing the cancellation module rather than the pinned-constants block the spec already mandated, and not adding a Deps edge to the block owner. (`V9a`'s plan-side description of the pinned-constants block was sharpened still later, in b9de3ee on 2026-06-11.)

## Solution Space

**Shape:** single

### Recommendation

Reconcile `V17a`'s ownership prose with the spec's placement requirement; the fix is internal to the plan (the spec already pins the placement and is read-only here).

- In `docs/plan_topics/V17a-cancellation-core.md` **Adds**, strike the phrasing that makes the cancellation module the declaration site ("the single loom-owned cancellation-runtime constant … the one declared source that `V9g`'s … and `V9i`'s … both consume — neither leaf redeclares it") and replace it with text stating that `V17a` defines the cancellation-runtime *semantics* of `SHUTDOWN_AWAIT_CAP_MS = 2000` (value sourced from `patch-skew-degradation.md`) as a conceptual consumer, while the constant *physically resides* in the single source-of-truth pinned-constants block established by `V9a` (per `patch-skew-degradation.md` §`session_shutdown` sub-step 3), so `V18c`'s build-time literal-read assertion can reach it; `V9g` and `V9i` consume the same block constant and no leaf redeclares it.
- Add `V9a` to `V17a`'s **Deps** (currently `V17a-T, V8a, V4d`) as the pinned-constants-block owner the reframed Adds now references.
- In `docs/plan_topics/V9a-capability-probe.md` **Adds**, record that the cancellation-runtime constant `SHUTDOWN_AWAIT_CAP_MS` resides in the same source-of-truth pinned-constants block alongside the probe constants, so the block has a single explicit physical owner.
- In `docs/plan_topics/V18c-version-bump-checklist.md`, include `SHUTDOWN_AWAIT_CAP_MS` in the pinned-constants literal-read assertion the leaf already runs over the block, matching the spec's "the build-time literal-read assertions can assert it."

Edge cases the implementer must watch: keep `V9g`'s and `V9i`'s existing references to `SHUTDOWN_AWAIT_CAP_MS` as consumers — they already consume the declared constant and must not be turned into redeclaration sites; the value `2000` and its `patch-skew-degradation.md` provenance remain the single source of the literal.

## Relationships

None

---

# T40 — V18c strict-capability probe gate is named in Adds but has no asserting test

**Original heading:** Strict-capability probe added with no asserting test
**Original section:** V18c — Version-bump static gates
**Kind:** validation
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

`V18c` lists "the strict-capability probe" among the build-time static gates it adds (`Adds.` bullet), but neither `V18c`'s `Tests.` bullets nor its `Ships when.` condition name a test for it. The four asserted gates are step 2(a)/2(b) surface-inventory, the `engines.node` literal-read, the `peerDependencies` pin, and the `loom/typecheck/session-shutdown-reason-snapshot` brand string. The strict-capability probe gate is absent from both the tests task `V18c-T` and the impl leaf's `Ships when.`

The spec gives this gate a precise behavioural contract with two arms. Bump-procedure step 7 ([`version-bump-triggers.md`](docs/spec_topics/pi-integration-contract/version-bump-triggers.md)) owns the rename-detection arm: the SDK surface-inventory assertion "catches a strict-capability indicator present on the `Model<Api>` namespace but not under the probed name `strictCapable`" and is the mechanical gate that fails until the probe constant is renamed in the same bump. The `strict-capability-absence-pin` ([`audit-recognised-shapes.md`](docs/spec_topics/pi-integration-contract/audit-recognised-shapes.md)) owns the complementary arm: the existing `strict-capability-probe` literal-read assertion "MUST additionally fail if any reachable `Model<Api>` declaration exposes a `strictCapable` member under the probed name."

Neither arm is exercised. The generic step 2(a) test V18c does name ("each `SDK_SURFACE_INVENTORY` member is present on the pinned SDK") asserts positive presence of inventory members; it does not assert that the strict-capability gate reddens on a renamed indicator or on a member present under the probed name. The gate the spec calls "the mechanical gate that fails until step 7 has been completed" therefore has no test proving it reddens.

## Plan Documents

- `docs/plan_topics/V18c-version-bump-checklist.md` — Adds / Tests / Ships when (edited)
- `docs/plan_topics/V18c-T-version-bump-checklist.md` — Tests (edited)
- `docs/plan_topics/V18a-capability-inventory.md` — SDK_SURFACE_INVENTORY / `strict-capability-probe` entry (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-triggers.md` — step 7 (rename-detection arm) (read-only)
- `docs/spec_topics/pi-integration-contract/audit-recognised-shapes.md` — `strict-capability-absence-pin` (absence-under-the-probed-name arm) (read-only)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — step 2(a) literal-read assertion (read-only)

## Affected Leaves

**Phases:** Vertical (V18 — Build-time SDK gates)

**Leaves (implementation order):**

- V18c-T — Pi version-bump static gates (tests) — (modified)
- V18c — Pi version-bump static gates — (modified)

## Consequence

**Severity:** correctness

The spec frames the strict-capability gate as a mechanical gate that must redden until the probe constant is reconciled, yet with no asserting test an implementer can ship a no-op gate that stays CI-green; the rename-detection and absence-under-the-probed-name obligations then ship unverified. Two reasonable implementers diverge — one assumes the generic step 2(a) presence test covers it, another adds dedicated negative fixtures — so the leaf can ship without the gate the spec requires.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `V18c` and its tests task `V18c-T` were both created in c6a664e, the initial plan build. From that first commit the `Adds.` bullet named "the strict-capability probe" among the build-time gates while the `Tests.` bullets and `Ships when.` covered only step 2(a)/2(b), `engines.node`, `peerDependencies`, and the reason-snapshot brand string. A pickaxe walk (`git log -S 'strictCapable' -- V18c-T-version-bump-checklist.md`, `git log -S 'absence-under-the-probed-name'`) confirms no later commit ever added a strict-capability test; subsequent commits to the leaf touched other concerns only.

## Solution Space

**Shape:** single

### Recommendation

Add the strict-capability gate to `V18c`'s test surface and acceptance condition:

- In `docs/plan_topics/V18c-T-version-bump-checklist.md`, add a failing `Tests.` bullet asserting the `strict-capability-probe` surface-inventory gate reddens in both spec-defined scenarios: (1) the rename-detection arm — a reachable `Model<Api>` declaration exposes a strict-capability indicator under a name other than the probed `strictCapable` (indicator present on the namespace, absent under the probed name), per [`version-bump-triggers.md` step 7](docs/spec_topics/pi-integration-contract/version-bump-triggers.md); (2) the absence-under-the-probed-name arm — a reachable `Model<Api>` declaration exposes a `strictCapable` member under the probed name, per the `strict-capability-absence-pin` in [`audit-recognised-shapes.md`](docs/spec_topics/pi-integration-contract/audit-recognised-shapes.md). One negative fixture per arm.
- Mirror the bullet into `docs/plan_topics/V18c-version-bump-checklist.md`'s `Tests.` so the impl leaf carries the same assertion.
- Extend `V18c`'s `Ships when.` to name the strict-capability gate alongside the step-2(a)/2(b), `engines.node`, peer-dep, and reason-snapshot gates.

The gate consumes the existing `strict-capability-probe` entry's `probedName` payload from `SDK_SURFACE_INVENTORY` (V18a); no spec edit is required — both arms are already pinned in the cited spec sites.

## Relationships

- T41 "Provider seed-field table shipped without its `Api`-coverage assertion in V18c's Tests/Ships-when" — same-cluster (sibling V18c gate with the identical Tests/Ships-when validation gap; resolves independently with the same kind of edit)
- T44 "V18c bundles mechanically-gated build-time tests with non-testable editorial obligations under one Ships-when" — must-follow (its recommendation extends V18c Ships-when to include the strict-capability gate; whichever leaf retains the gate is where this test must land)

---

# T41 — Provider seed-field table shipped without its `Api`-coverage assertion in V18c's Tests/Ships-when

**Original heading:** Provider seed-field table added with no asserting test
**Original section:** V18c — Version-bump static gates
**Kind:** validation
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

V18c's **Adds** field lists "the provider seed-field table" among the build-time gates the leaf operationalises, but its **Tests** and **Ships when** fields name no assertion for it. The spec makes a specific build-time check the mechanical gate for this obligation: `provider-error-mapping.md` §Provider seed-field mapping pins the `Api`-coverage assertion as one that "enumerates pi-ai's exposed `Api` literal-union values and asserts every value appears as a row key in the seed-field table constant," and version-bump step 6 (`version-bump-triggers.md`) states "The build-time `Api`-coverage assertion is the mechanical gate that fails until this step has been completed." A new pi-ai `Api` value is meant to light the assertion red at the bump commit, parallel to a new SDK capability.

V18c's Tests cover only step 2(a)/2(b) surface-inventory, the `engines.node` floor literal-read, the `peerDependencies` pin, and the `SessionShutdownEvent['reason']` brand-string snapshot; Ships-when names the same set. Neither references the seed-field `Api`-coverage gate. Because the leaf is the home for the seed-field table and its gate, a reviewer can satisfy V18c's Ships-when condition with the table constant authored but the gate that protects it never built.

## Plan Documents

- `docs/plan_topics/V18c-version-bump-checklist.md` — Adds / Tests / Ships when (edited)
- `docs/plan_topics/coverage-matrix.md` — §Code-keyed obligation areas (option-dependent)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/provider-error-mapping.md` — §Provider seed-field mapping (read-only)
- `docs/spec_topics/pi-integration-contract/version-bump-triggers.md` — step 6 (read-only)

## Affected Leaves

**Phases:** Vertical slice V18 (Build-time SDK gates)

**Leaves (implementation order):**

- `V18c-T` — Version-bump static gates (tests) — (modified)
- `V18c` — Pi version-bump static gates — (modified)

## Consequence

**Severity:** correctness

If V18c ships as written, an implementer satisfies Ships-when by authoring the seed-field table and the named gates without ever building the spec-mandated build-time `Api`-coverage assertion. A later `@earendil-works/pi-ai` minor that adds an `Api` value then silently regresses seed support for that provider: the gate the spec relies on to redden at the bump commit does not exist, so `npm test` stays green and the omission goes undetected.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** The V18c leaf has listed "the provider seed-field table" in its Adds field since the plan's first commit (c6a664e); no Tests or Ships-when bullet for the `Api`-coverage assertion has existed in any revision (the `Api-coverage` token appears in no commit touching any plan file). The gap is original to the leaf, not introduced by a later edit.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/V18c-version-bump-checklist.md`, add a Tests bullet for the provider seed-field `Api`-coverage gate and extend Ships-when to include it.

- **Tests.** Add a bullet asserting the build-time `Api`-coverage assertion reddens when a pi-ai `Api` value is absent from the seed-field table constant's row keys (the spec's named trigger: a new/unlisted `Api`), backed by a per-provider seed-field fixture that also reddens when a supported provider's seed field is renamed, retyped, or moved between the supporting and non-supporting sets (step 6's fixture-rerun trigger). Cite the gate's contract at `provider-error-mapping.md#provider-seed-field-mapping` and step 6 at `version-bump-triggers.md`.
- **Ships when.** Add the `Api`-coverage gate to the green-on-`main` list alongside the step-2(a)/2(b), `engines.node`, peer-dep, and reason-snapshot gates.

The asserting test's structural shape (fixture layout, number of bullets) is the implementer's choice; the binding content is that the gate reddens on an unlisted `Api` value and on a renamed/retyped/moved seed field for a supported provider, and that Ships-when names it.

## Relationships

- T40 "V18c strict-capability probe gate is named in Adds but has no asserting test" — same-cluster (parallel untested-gate gap in the same leaf; resolved by the same kind of edit but an independent assertion)
- T44 "V18c bundles mechanically-gated build-time tests with non-testable editorial obligations under one Ships-when" — must-follow (its Ships-when entry for the `Api`-coverage gate depends on this finding authoring the test)

---

# T42 — `engines.node` floor gate described two-way in V18c, three-way in the spec and V18d

**Original heading:** `engines.node` gate described as two-way in its owning leaf, three-way everywhere else
**Original section:** V18c — Version-bump static gates
**Kind:** clarity, assumptions
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

`V18c` owns the build-time `engines.node` floor gate, but both its **Adds** ("the `engines.node` floor literal-read") and its **Tests** bullet ("The `engines.node` literal-read test equals the SDK floor") describe a **two-operand** comparison: the loom `package.json#engines.node` literal against a single "SDK floor". The spec that V18c cites — [`version-bump-step2b.md` step 3](../spec_topics/pi-integration-contract/version-bump-step2b.md) — mandates a **three-way equality** across (i) the loom `package.json#engines.node` literal, (ii) the in-repo pinned floor recorded in the `pi-engines-node` row of `SDK_SURFACE_INVENTORY`, and (iii) the floor read live at build time from the installed `@earendil-works/pi-coding-agent` `package.json` under `node_modules`. Operand (iii) is the only live read and is what makes the gate fail red on a Pi minor bump that moves the upstream floor.

The two-way framing drops operand (ii) entirely and collapses (iii) into an undefined "SDK floor", so an agent implementing the gate from V18c builds a behaviourally different artefact than the spec and the rest of the corpus describe. `V18d`'s revert path explicitly names "the `engines.node` three-way equality gate", and `H1a` (the `package.json#engines.node` initial-population owner) explicitly defers operands (ii) and (iii) to "`V18c`'s three-way `engines.node` equality gate". V18c is the lone surface that under-describes the gate it owns.

The paired tests leaf `V18c-T` carries the identical two-way phrasing in its Tests bullet and must be corrected in lockstep, or the red-test specification will encode the wrong gate shape.

## Plan Documents

- `docs/plan_topics/V18c-version-bump-checklist.md` — Adds + Tests (edited)
- `docs/plan_topics/V18c-T-version-bump-checklist.md` — Tests (edited)
- `docs/plan_topics/V18d-version-bump-acceptance.md` — revert-path gate list (read-only; already three-way, the alignment target)
- `docs/plan_topics/H1a-scaffold-and-toolchain.md` — Adds / population-time check (read-only; already references V18c's three-way gate and owns operand (i))
- `docs/plan_topics/V18a-capability-inventory.md` — `SDK_SURFACE_INVENTORY` owner (option-dependent; operand (ii) is the `pi-engines-node` row, whose owning leaf is the subject of a related finding)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-step2b.md` — step 3, `engines.node` floor re-confirmation (read-only; the authoritative three-way definition the fix aligns to)

## Affected Leaves

**Phases:** Vertical slices (V18 — Build-time SDK gates)

**Leaves (implementation order):**

- V18c-T — Pi version-bump static gates (tests) — (modified)
- V18c — Pi version-bump static gates — (modified)

## Consequence

**Severity:** correctness

An implementer working from V18c builds a two-operand `engines.node` gate that omits the in-repo pinned `pi-engines-node` floor (operand (ii)) and the live installed-SDK read (operand (iii)). That gate cannot detect the upstream-floor-move case the spec designed it to catch, and it silently contradicts the gate V18d's revert path re-runs and H1a defers to — leaving the corpus with two different definitions of the same gate.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e
**History:** The plan corpus is git-tracked. `git log --follow` on `docs/plan_topics/V18c-version-bump-checklist.md` shows the file was created in `c6a664e` (2026-06-10, "pi-loom plan: build/update plan for spec.md + review"), the plan's first build. `git log -S 'equals the SDK floor'` confirms the two-way "equals the SDK floor" Tests phrasing entered in that same inception commit and has never been revised across the six later V18c-touching commits. The spec's three-way requirement predates the plan: `git log -S 'three-way equality'` on `version-bump-step2b.md` places it in spec commit `6798428` (2026-06-05), and `git show c6a664e:docs/spec_topics/pi-integration-contract/version-bump-step2b.md` confirms the three-way text was present when V18c was authored — so V18c under-described an already-three-way spec from its first commit. The internal plan inconsistency widened later when `V18d` was split out (`8af3204`, 2026-06-11) and its "three-way equality gate" reference was added (`eed7975`, 2026-06-11), but those edits only made the pre-existing divergence visible; the root defect dates to inception.

## Solution Space

**Shape:** single

### Recommendation

Rewrite V18c to describe the three-way `engines.node` equality the spec and V18d already define.

- In `V18c-version-bump-checklist.md` **Adds**, replace "the `engines.node` floor literal-read" with a description of the three-way equality gate across the three operands: (i) the loom `package.json#engines.node` literal, (ii) the in-repo pinned floor in the `pi-engines-node` row of `SDK_SURFACE_INVENTORY`, (iii) the floor read live at build time from the installed `@earendil-works/pi-coding-agent` `package.json`.
- In `V18c-version-bump-checklist.md` **Tests**, replace "The `engines.node` literal-read test equals the SDK floor" with a bullet asserting the three-operand equality, naming operand (iii) as the only live read (the operand that reddens when the upstream floor moves while (i) and (ii) stay pinned), citing `version-bump-step2b.md` step 3.
- In `V18c-T-version-bump-checklist.md` **Tests**, apply the same correction so the red-test specification asserts the three-way equality rather than the two-way "equals the SDK floor".

Cite `version-bump-step2b.md` step 3 as the operand definition and keep the phrasing consistent with V18d's "three-way equality gate" and H1a's existing reference.

## Relationships

- T48 "Non-capability `SDK_SURFACE_INVENTORY` rows have no owning leaf" — must-follow (operand (ii) of this three-way gate is the `pi-engines-node` row; that finding decides which leaf populates it, so the row must exist for this gate's operand (ii) to resolve)
- T45 "Reason-snapshot type-equality gate named under `npm test` but exercised only under `npm run typecheck`" — same-cluster (edits the same V18c Tests/Ships-when bullets; resolves independently)

---

# T43 — V18c mislabels the manual editorial-review checklist as a static build-time gate, leaving it with no done condition

**Original heading:** Editorial-review checklist items added with no verification step / mislabeled as static build-time gates
**Original section:** V18c — Version-bump static gates
**Kind:** validation, clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V18c` Adds enumerates "the editorial-review checklist items" as one item in its list of "static build-time gates", grammatically equal to the SDK surface-inventory tests, the `engines.node` literal-read, the `peerDependencies` assertion, and the reason-snapshot brand-string gate. But those checklist items — `(a)`–`(aj)` in `version-bump-step2.md` — are not build-time gates. The spec routes their detection to **editorial review**: the contributor MUST (for `(a)`–`(e)`) and SHOULD (for `(f)`–`(aj)`) audit each presupposition against the candidate Pi minor and record a per-item outcome (`pass` / `fail` / `N/A` / `not-performed` + rationale, with item `(e)`'s two sub-outcomes) **in the bump commit message**. None of that is exercisable by `npm test`.

The mislabel propagates into a verification gap. `V18c`'s Tests and Ships-when name only the four genuinely build-time gates (step 2(a)/2(b), `engines.node`, peer-dep, reason-snapshot); neither mentions the checklist. So "add the editorial-review checklist items" carries no done condition — a reviewer who passes `V18c`'s Ships-when cannot tell whether the checklist obligation was satisfied, and the leaf provides no mechanism (not even a commit-message presence check) confirming the per-item outcomes the spec mandates were recorded.

The spec already supplies the natural done condition: the mandatory per-item commit-message recording. The plan leaf neither cites that as the checklist's acceptance basis nor distinguishes the manual obligation from the four mechanical gates it sits beside.

## Plan Documents

- `docs/plan_topics/V18c-version-bump-checklist.md` — Adds, Tests, Ships-when (edited)
- `docs/plan_topics/V18c-T-version-bump-checklist.md` — Tests, Ships-when (option-dependent)
- `docs/plan.md` — `### V18 — Build-time SDK gates` slice listing (read-only)
- `docs/plan_topics/V18d-version-bump-acceptance.md` — Adds / Ships-when references to V18c's static gates (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — editorial-review checklist `(a)`–`(aj)` and the per-item commit-message recording obligation (read-only)

## Affected Leaves

**Phases:** Vertical slice V18 — Build-time SDK gates

**Leaves (implementation order):**

- `V18c` — Pi version-bump static gates — (modified)
- `V18c-T` — Pi version-bump static gates (tests) — (modified)

(A `<new>` documentation leaf may absorb the checklist if this is co-resolved with the sibling "Leaf too large" finding; that leaf is option-dependent and not asserted here.)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one reads "static build-time gate" literally and tries to automate manual host-presupposition audits the spec deliberately routes to editorial review (some of which, e.g. items `(a)` and `(e)`, are MUST-level and require human source-diffing of Pi's `dist/*.js`); another, finding the checklist absent from Tests and Ships-when, drops it silently and ships `V18c` green without ensuring any bump-time recording mechanism exists. Either outcome leaves the spec's mandatory per-item commit-message recording unenforced and unowned at bump time.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** `c6a664e` (plan inception) — established the verification gap; `8af3204` ("resolve V18c bundles static gates with runtime-evidence acceptance gate") — sharpened the mislabel.
**History:** The plan corpus is git-tracked. `V18c`'s Adds named "the editorial-review checklist items" with no asserting Test or Ships-when entry from the first plan commit `c6a664e`, where the Adds read "…the contributor version-bump checklist and its build-time gates: … — plus the editorial-review checklist items." The verification gap is therefore present since inception. The specific "static build-time gates" mislabel was introduced at `8af3204`, the bundle-split resolution, which reworded the Adds to fold the editorial checklist grammatically into the comma-separated "static build-time gates" enumeration rather than appending it with "plus". No later commit (`ce32225`, `328ba4d`, `c42f13d`, `81ab342`, `b9de3ee`) touched the editorial-checklist framing.

## Solution Space

**Shape:** single

### Recommendation

Reclassify the checklist as a manual editorial obligation with the spec's commit-message recording as its done condition. In `V18c` Adds, separate the four mechanical gates (surface-inventory, `engines.node`, peer-dep, reason-snapshot) from the editorial-review checklist, and state that the checklist items are the contributor's manual per-bump audit whose done condition is the per-item outcome recording in the bump commit message that `version-bump-step2.md` mandates (`pass` / `fail` / `N/A` / `not-performed` + rationale; item `(e)` records two sub-outcomes). Add a Ships-when clause pointing the checklist's acceptance to that recording rather than to `npm test`.

The spec already owns the done condition; the defect is purely that `V18c` mislabels the obligation and omits the pointer. Edge cases the implementer must watch: item `(e)` records two sub-outcomes `(e.i)`/`(e.ii)`, and items `(a)`–`(e)` are MUST-level while `(f)`–`(aj)` are SHOULD-level-audit-but-MUST-record — the relabelling must not flatten that distinction. If the sibling "Leaf too large" finding is resolved by moving the editorial checklist to a separate documentation leaf, fold this relabelling into that move rather than editing `V18c` twice.

## Relationships

- T44 "V18c bundles mechanically-gated build-time tests with non-testable editorial obligations under one Ships-when" — co-resolve (its proposed split moves the editorial checklist to a documentation/template leaf with a human-review done condition, which would absorb this fix)
- T45 "Reason-snapshot type-equality gate named under `npm test` but exercised only under `npm run typecheck`" — same-cluster (same leaf's Ships-when accuracy; resolves independently)

---

# T44 — V18c bundles mechanically-gated build-time tests with non-testable editorial obligations under one Ships-when

**Original heading:** Leaf too large — testable static gates bundled with non-testable editorial artifacts
**Original section:** V18c — Version-bump static gates
**Kind:** step-atomicity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V18c` ("Pi version-bump static gates") packs two kinds of work with different done-conditions into a single leaf. Its **Adds** enumerates mechanically-gated build-time tests (the step-2(a)/2(b) SDK surface-inventory assertions, the `engines.node` floor literal-read, the `peerDependencies` pin assertion, the capability-probe constants, the `SessionShutdownEvent['reason']` brand-string snapshot, the provider seed-field table, and the strict-capability probe) *and* the contributor editorial-review checklist items (a)–(aj) drawn from `version-bump-step2.md`. The (a)–(aj) items are SHOULD-level manual obligations whose detection routes to editorial review at bump time; they are not exercised by `npm test`.

`V18c`'s **Ships when** reads only `npm test runs the step-2(a)/2(b), engines.node, peer-dep, and reason-snapshot gates green on main`. That gate observes neither the editorial checklist nor two of the build-time gates Adds names (the provider seed-field / `Api`-coverage gate and the strict-capability probe gate). A reviewer who watches the Ships-when gate go green therefore cannot confirm the editorial half was authored, and the leaf carries no observable closing condition for it. Because the leaf mixes a mechanically-observable done-condition with a human-review done-condition, the human-review work has no closing observation and can ship unimplemented while the leaf is marked complete.

The clean decomposition is to keep the mechanically-gated build-time tests in `V18c` (with every gate it retains actually observable in Ships-when) and lift the non-testable editorial-review checklist into a separate documentation/template leaf whose Ships-when is human review.

## Plan Documents

- `docs/plan_topics/V18c-version-bump-checklist.md` — `V18c` leaf, **Adds** + **Ships when** (edited)
- `docs/plan_topics/V18c-T-version-bump-checklist.md` — paired tests leaf, **Tests** + **Ships when** (option-dependent)
- `docs/plan_topics/` — new documentation/template leaf housing the (a)–(aj) editorial checklist (edited — new file)
- `docs/plan.md` — `V18 — Build-time SDK gates` section list; the new leaf must be linked in (edited)
- `docs/plan_topics/V18d-version-bump-acceptance.md` — `V18d` enumerates `V18c`'s static gates in its revert re-run list (option-dependent)
- `docs/plan_topics/conventions.md` — leaf format / paired-`-T` ritual / new-leaf authoring rules (read-only)
- `docs/plan_topics/coverage-matrix.md` — closing-leaf mapping; consulted if the editorial leaf carries an un-anchored MUST (read-only)
- `docs/plan_topics/H5b-warn-only-canary.md` — `Deps.` per the transitive-completeness rule, only if the new leaf introduces a closing test or un-anchored MUST (option-dependent)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — source of the (a)–(aj) editorial-review checklist and the editorial-vs-mechanical split (read-only)
- `docs/spec_topics/pi-integration-contract/version-bump-step2b.md` — promote/co-edit obligation referenced by the build-time gates (read-only)

## Affected Leaves

**Phases:** Vertical slice `V18` — Build-time SDK gates

**Leaves (implementation order):**

- `V18c` — Pi version-bump static gates — (modified)
- `V18c-T` — Pi version-bump static gates (tests) — (modified)
- `<new>` — version-bump editorial-review checklist (documentation/template leaf) — (added)
- `V18d` — Pi version-bump runtime-evidence acceptance gate and revert path — (modified)

## Consequence

**Severity:** correctness

`V18c`'s `npm test` Ships-when can pass while the (a)–(aj) editorial-review checklist is never authored, so a spec obligation (the contributor bump-time editorial review) silently ships unimplemented with no closing observation. Two reasonable implementers would also diverge on whether `V18c` is "done," since the seed-field/`Api`-coverage and strict-capability build-time gates Adds names are not in Ships-when either.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** The `V18c` leaf was created in c6a664e (its first commit, then titled "Pi version-bump procedure and gates") with the editorial-review checklist items already bundled into **Adds** alongside the build-time gates ("… plus the editorial-review checklist items"), and its **Ships when** named only the four mechanical gates run under `npm test` — never the editorial checklist nor the seed-field/strict-capability gates. The later 8af3204 ("V18c bundles static gates with runtime-evidence acceptance gate") split the runtime-evidence acceptance gate out to `V18d` and reframed the title to "static gates," but left the editorial-checklist bundling and the Ships-when omission intact; the defect has been present since the leaf's inception.

## Solution Space

**Shape:** multiple

This finding carries two independent obligations — a structural split and an acceptance-criteria tightening — that should not be edited in one pass. Throughout, the spec is read-only: the (a)–(aj) checklist obligation is owned by `version-bump-step2.md`; do not edit any `docs/spec_topics/**` file to resolve this plan-side leaf-decomposition issue. New-leaf authoring follows `conventions.md` (copy `leaf-template.md`, link the new leaf into `docs/plan.md`); do not invent a final leaf ID — let the implementer allocate one. Resolve Obligation A first (it bounds `V18c`'s scope to mechanically-gated work and is independent of the sibling test-authoring findings), then Obligation B on the reduced leaf.

### Obligation A — Lift the non-testable editorial checklist into its own human-review leaf

Create a new documentation/template leaf (copied from `leaf-template.md`, saved under `docs/plan_topics/`) that owns the contributor version-bump editorial-review checklist — the (a)–(aj) items from `version-bump-step2.md`, including item (e)'s two sub-outcomes — and whose **Ships when** is the human-review done-condition (the checklist/commit-message template exists and records one outcome per item). Strike `… plus the editorial-review checklist items` from `V18c`'s **Adds**; add the new leaf's link to `docs/plan.md`'s `V18 — Build-time SDK gates` section. If the new leaf carries an un-anchored normative MUST or a closing test, add it to `H5b`'s `Deps.` per the transitive-completeness rule.

### Obligation B — Make every build-time gate `V18c` retains observable in its Ships-when

Extend `V18c`'s **Ships when** so the provider seed-field / `Api`-coverage gate and the strict-capability probe gate Adds names are actually exercised, not merely listed. The asserting tests for those two gates are authored by the sibling findings (T40, T41); this obligation's scope here is the Ships-when line that observes them and keeping `V18d`'s revert re-run enumeration consistent with the gate set `V18c` retains. Mirror in `V18c-T`'s Tests/Ships-when.

## Relationships

- T43 "V18c mislabels the manual editorial-review checklist as a static build-time gate, leaving it with no done condition" — co-resolve (Obligation A's split moves the (a)–(aj) checklist to a human-review leaf, simultaneously resolving its no-done-condition / mislabel defect)
- T41 "Provider seed-field table shipped without its `Api`-coverage assertion in V18c's Tests/Ships-when" — must-precede (Obligation B's Ships-when entry for the `Api`-coverage gate depends on that finding authoring the test)
- T40 "V18c strict-capability probe gate is named in Adds but has no asserting test" — must-precede (Obligation B's Ships-when entry for the strict-capability gate depends on that finding authoring the test)

---

# T45 — Reason-snapshot type-equality gate named under `npm test` but exercised only under `npm run typecheck`

**Original heading:** Reason-snapshot gate named under the wrong runner in Ships-when
**Original section:** V18c — Version-bump static gates
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V18c`'s ship gate reads: "`npm test` runs the step-2(a)/2(b), `engines.node`, peer-dep, and reason-snapshot gates green on `main`." The "reason-snapshot gate" is the bidirectional `SessionShutdownEvent['reason']` type-equality assertion that surfaces the brand string `loom/typecheck/session-shutdown-reason-snapshot`, which `V18c`'s Adds and Tests both name as a gate the leaf delivers.

Per the version-bump procedure, that assertion is a build-time `tsc` assertion exercised by `npm run typecheck`, not by `npm test`. `version-bump-intro.md` step 1 runs `npm run typecheck` and routes the brand-string failure there; `version-bump-triggers.md` step 5 is explicit that the snapshot entry has two distinct gates with different runners: "the bidirectional `SessionShutdownEvent['reason']` type-equality assertion … runs under `npm run typecheck` per step 1, not under step 2(a)'s `npm test` literal-read; the two assertions live in the same surface-inventory test file but have different gates and different failure-routing." `conventions.md` §REQ-ID discipline reinforces the same split, carving `loom/typecheck/*` out of the diagnostics registry as a build-time `tsc` brand string rather than a `npm test` surface.

Because `V18c`'s ship condition invokes only `npm test`, only the `npm test`-side arm of the snapshot pair (step 2(a)'s literal-array consistency check) is observable at the ship gate. The brand-string type-equality arm — the bidirectional assertion that is the actual widen/narrow detector — is never exercised by the leaf's externally-observable ship condition, even though the leaf claims it.

## Plan Documents

- `docs/plan_topics/V18c-version-bump-checklist.md` — Ships when (edited)
- `docs/plan_topics/H1a-scaffold-and-toolchain.md` — Adds (npm-script inventory) (option-dependent)
- `docs/plan_topics/V18c-T-version-bump-checklist.md` — Tests (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-intro.md` — step 1 (re-typecheck against the new package) (read-only)
- `docs/spec_topics/pi-integration-contract/version-bump-triggers.md` — step 5 (pinned-constants / brand-string assertion) (read-only)

## Affected Leaves

**Phases:** Horizontal; Vertical slice V18 — Build-time SDK gates

**Leaves (implementation order):**

- H1a — Project scaffold and toolchain — (modified) — only if the chosen runner is the spec's `npm run typecheck`; H1a currently declares only `npm test` and `npm run build` scripts, so adding `npm run typecheck` would land here.
- V18c — Pi version-bump static gates — (modified)

## Consequence

**Severity:** correctness

`V18c` can ship "green" against a ship condition that never compiles the brand-string assertion, so the type-equality arm the leaf claims to deliver is not actually exercised at its gate; a Pi `SessionShutdownEvent['reason']` union widen/narrow — exactly what the bidirectional assertion exists to catch — would not redden the ship gate as written. Two implementers also diverge on whether `npm test` already covers the `tsc` arm, producing leaves with materially different gate coverage.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `V18c-version-bump-checklist.md` was created in c6a664e (its first and only file-creating commit) with the `Ships when` line already naming the reason-snapshot gate under `npm test`, while the same commit's Adds/Tests describe it as the `loom/typecheck/...` brand-string assertion. The runner mismatch has therefore existed since the leaf's first commit; the later V18c edits (81ab342…b9de3ee, which reworked deps and split off the runtime-evidence gate) left the Ships-when runner untouched.

## Solution Space

**Shape:** single

### Recommendation

Rewrite `V18c`'s `Ships when.` bullet so the brand-string type-equality arm is gated by the runner that actually compiles the assertion module, while the literal-read arms stay under `npm test`. Concretely, the gate must state that `npm run typecheck` runs the `loom/typecheck/session-shutdown-reason-snapshot` brand-string type-equality assertion green on `main` (matching `version-bump-intro.md` step 1 and `version-bump-triggers.md` step 5), and `npm test` runs the step-2(a)/2(b) surface-inventory, `engines.node`, peer-dep literal-read, and the snapshot's step-2(a) literal-array consistency checks green on `main`.

Edge case the implementer must reconcile: the named `tsc` runner has to resolve to a script that actually exists. `H1a` currently provisions only `npm test` and `npm run build`, not the spec's `npm run typecheck`. Either extend `H1a`'s script inventory to declare the `npm run typecheck` script the spec names, or name the existing `tsc`-running `npm run build` script in `V18c`'s Ships-when — but the runner named in the ship gate must be one that compiles the assertion file so the brand-string red is observable at the gate.

## Relationships

- T42 "`engines.node` floor gate described two-way in V18c, three-way in the spec and V18d" — same-cluster (same V18c leaf, resolves independently)
- T44 "V18c bundles mechanically-gated build-time tests with non-testable editorial obligations under one Ships-when" — same-cluster (same V18c static-gates list / Ships-when, resolves independently)

---

# T46 — V18d's revert path normatively re-runs V18c's static gates, but V18c is absent from V18d's Deps

**Original heading:** V18d requires V18c but V18c is absent from Deps (direct or transitive)
**Original section:** V18d — Version-bump runtime-evidence acceptance gate and revert path
**Kind:** consistency
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V18d`'s **Ships when** carries a normative obligation that depends on `V18c` being complete: after the prior pin is restored, *"the contributor MUST re-run [`V18c`]'s static build-time gates against the restored prior pin … and confirm they pass green before the revert is merged. That green re-run is what establishes the revert is complete."* This makes a green run of V18c's static gates (step-2(a)/2(b) surface-inventory, the `engines.node` three-way equality gate, the `peerDependencies` literal-read, and the `loom/typecheck/session-shutdown-reason-snapshot` brand-string gate) a hard prerequisite of V18d's revert procedure.

V18d's declared dependencies are `V18d-T`, `H4a`, `V5d`, `V11f`, `V13c`, `V14a`, `V15a`, `V17a`. `V18c` appears nowhere in that list, and it is not reachable transitively — the full dependency closure of V18d (78 leaves) does not contain V18c. `V18c` is cited in V18d's **Adds.** only as the *owner* of the static gates (a scope delimiter), never as a prerequisite of V18d's own procedure.

A Deps-ordered scheduler may therefore pick up and complete V18d before V18c exists, at which point V18d's revert path references a gate suite that has not yet been built. The dependency the prose asserts is real but is not encoded where the plan's sequencing relies on it.

## Plan Documents

- `docs/plan_topics/V18d-version-bump-acceptance.md` — **Deps.** field (edited)
- `docs/plan_topics/V18c-version-bump-checklist.md` — whole leaf (read-only)
- `docs/plan.md` — V18 Interleave note (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** V18 — Build-time SDK gates (Vertical slice)

**Leaves (implementation order):**

- `V18c` — Pi version-bump static gates — (read into scope as the unencoded prerequisite; file unchanged)
- `V18d` — Pi version-bump runtime-evidence acceptance gate and revert path — (both)

## Consequence

**Severity:** correctness

A Deps-driven sequencer can schedule V18d before V18c, so V18d's normative "re-run V18c's static gates before the revert merges" obligation references gates that do not yet exist; two implementers would diverge on whether V18d is buildable in isolation, and a revert authored against an absent gate suite cannot be validated as the prose requires.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** eed7975 — pi-loom plan: resolve "revert path re-asserts gates return green" (2026-06-11, Thomas Andersen)
**History:** V18d was created at 8af3204 (2026-06-11) when it was split out of V18c; at creation its **Deps.** omitted V18c and its revert path carried no V18c re-run obligation, so V18c-in-Adds was a pure scope delimiter and no inconsistency existed. Commit eed7975 added the normative "the contributor MUST re-run V18c's static build-time gates … before the revert is merged" sentence to **Ships when** without adding V18c to **Deps.**, which is the change that turned V18d's procedure into a V18c-dependent one while leaving the dependency unencoded.

## Solution Space

**Shape:** single

### Recommendation

Encode the dependency: treat the V18c re-run as the real prerequisite it is — V18d's revert path cannot be validated until V18c's static gates exist, so make V18c a dependency of V18d. In `docs/plan_topics/V18d-version-bump-acceptance.md`, add `V18c` to the **Deps.** line, which currently reads `**Deps.** \`V18d-T\`, \`H4a\`, \`V5d\`, \`V11f\`, \`V13c\`, \`V14a\`, \`V15a\`, \`V17a\``.

The re-run obligation is load-bearing — it is the only stated check that the revert restored consistency across all five operands — so the dependency on V18c is genuine and should be encoded rather than dropped. The change is internal to the plan leaf files (the spec is read-only). Edge cases the implementer must watch: confirm no dependency cycle is created (V18c's own Deps are `V18c-T`/`V18a`/`V18b`, so none arises), and leave the `docs/plan.md` Interleave note untouched (it governs V9h/V9g's V18c dependency and explicitly does not constrain V18d).

## Relationships

- T44 "V18c bundles mechanically-gated build-time tests with non-testable editorial obligations under one Ships-when" — decision-overlap (if the revert path is split into a separate leaf, the V18c dependency relocates with it)

---

# T47 — V18b's Adds omits the broader-inventory population, entry-kind taxonomy, and land-green `src/` sweep the audit-introducing leaf must own

**Original heading:** Land-green precondition (new category entry kinds + `src/` sweep) absent from Adds; ownership ambiguous vs V18a
**Original section:** V18b — Inventory-closure audit
**Kind:** implementability
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

The spec's *Inventory-closure audit* paragraph (`inventory-audit-intro.md`) pins three obligations onto the leaf that introduces the build-time audit: (1) `SDK_SURFACE_INVENTORY` is "strictly broader than the seven capabilities" and must carry the non-capability surface entries — the category-(1) `pi.registerFlag` / `pi.getFlag` members, the typebox `{ Type }` / `{ Unsafe }` allow-lists, and (per V18c's literal-reads) the `pi-engines-node` / `peer-dep-range` / `strict-capability-probe` / `api-coverage` rows; (2) the entry-kind taxonomy (the `namespace-function` kind plus the category-(1)/(2)/(3) kinds the recogniser branches on) is implementation-owned and must be coined somewhere; and (3) "the commit that introduces this audit MUST also include whatever source-tree sweep is needed to keep `main` green" — every existing `src/` Pi-side reference deleted, promoted to an inventory entry, exempted, or rewritten into a recognised shape, in the same commit, because the audit "is intended to land green … not introduced as a 'land red, fix incrementally' gate."

None of these three is assigned in the plan. V18a's Adds creates the `CAPABILITY_OBLIGATIONS` and `SDK_SURFACE_INVENTORY` constants but scopes them to "the seven named SDK capabilities." V18b's Adds describes only the audit recogniser (resolution against entries, family-(4) discriminator routing, fail-closed canary). Neither leaf coins the entry-kind taxonomy, populates the non-capability inventory entries, or names the land-green `src/` sweep as a deliverable. V18b's Ships-when ("runs the closure audit green on `main`") implicitly presumes the sweep was done, but no Adds field makes it an owned obligation.

The result is an ownership gap between V18a (the inventory-constant leaf) and V18b (the audit leaf): an implementer picking up V18b must guess where the broader entries and the entry-kind taxonomy live, and whether the green-on-`main` sweep is their responsibility.

## Plan Documents

- `docs/plan_topics/V18b-inventory-audit.md` — Adds (edited)
- `docs/plan_topics/V18a-capability-inventory.md` — Adds, plus `V18a-T` Tests (option-dependent)
- `docs/plan_topics/V18c-version-bump-checklist.md` — Tests, step 2(a) (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/inventory-audit-intro.md` — "SDK capability inventory" / "Inventory-closure audit" (read-only; the governing authority the plan must align to)

## Affected Leaves

**Phases:** Vertical slices (V18 — Build-time SDK gates)

**Leaves (implementation order):**

- `V18a` — SDK capability inventory — (modified)
- `V18b` — Inventory-closure audit gate — (modified)
- `V18c` — Pi version-bump static gates — (blocked)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge on where the broader `SDK_SURFACE_INVENTORY` entries and the category-(1)/(2)/(3) entry-kind taxonomy live, and on whether the land-green `src/` sweep is V18b's responsibility. An implementer who builds V18b from its Adds alone ships a recogniser with no inventory entries to resolve against and no sweep, so the audit reddens on its first `main` run — directly violating the spec's "intended to land green" obligation and failing V18b's Ships-when.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `V18b-inventory-audit.md` has a single commit (c6a664e), the initial plan build, and its Adds has described only the audit recogniser — never the broader-inventory population, the entry-kind taxonomy, or the land-green `src/` sweep — since that first authoring. The two later edits to `V18a-capability-inventory.md` (235fdfe, b9de3ee, both 2026-06-11) reworked the partition assertion and Ships-when and did not touch the seven-capability scoping of `SDK_SURFACE_INVENTORY`, so they neither introduced nor closed this gap.

## Solution Space

**Shape:** single

### Recommendation

Split ownership so V18a owns inventory population + the entry-kind taxonomy, and V18b owns the audit + the land-green sweep. Widen V18a's Adds to populate the full `SDK_SURFACE_INVENTORY` (the non-capability category-(1) `pi.registerFlag`/`pi.getFlag` members, the typebox `{ Type }`/`{ Unsafe }` allow-lists, and the V18c-consumed `pi-engines-node`/`peer-dep-range`/`strict-capability-probe`/`api-coverage` rows) and to coin the entry-kind taxonomy; add a `V18a-T` bullet asserting the non-capability entries resolve so they do not ship unasserted. V18b's Adds states it coins only the category-(1)/(2)/(3) recogniser detection and performs the land-green `src/` sweep.

V18a already owns the `SDK_SURFACE_INVENTORY` constant, and the spec treats that constant as the single source of truth shared by the positive literal-read (V18c step 2(a)) and the negative audit (V18b); populating the full entry set in V18a keeps the constant single-owner and leaves V18b a focused audit leaf. The land-green `src/` sweep stays in V18b — the spec assigns it to the audit-introducing commit — and V18b's Ships-when already carries its green-on-`main` observable. Watch two edge cases: V18a's `CAPABILITY_OBLIGATIONS.length === 7` cardinality assertion is over the capability subset, not the broadened inventory, so broadening the inventory must not redefine that operand; and the sweep's target scope depends on the `src/**` production-layout precondition being established (see Related Findings).

## Relationships

- T48 "Non-capability `SDK_SURFACE_INVENTORY` rows have no owning leaf" — co-resolve (the same inventory-population ownership assignment resolves both this and that finding)
- T53 "V18b audit-methodology obligations have no coverage-matrix closing-leaf row" — same-cluster (both touch V18b but resolve independently — that one is coverage-matrix traceability, this one is Adds scope)
- T04 "Gate globs (`src/**` / `**/*.test.ts`) assume a project layout the scaffold never establishes" — decision-overlap (the land-green `src/` sweep presupposes the `src/**` layout that finding reports as unestablished, which constrains the sweep's scope)
