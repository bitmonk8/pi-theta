---
id: PTQ-0237
title: b0275 rebuilds the diagnostics-registry oracle that tests/helpers/registry-oracle.ts already centralises, via a narrower two-page reimplementation
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:192-205
  - tests/helpers/registry-oracle.ts:21-38
  - tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts
  - tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts
sites: 4                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0275 rebuilds the diagnostics-registry oracle that tests/helpers/registry-oracle.ts already centralises, via a narrower two-page reimplementation

## Observation
tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts declares a
local `RegistryRow` interface and a `REGISTRY` constant that reads
`code-registry-parse.md` and `code-registry-load.md` through `parseRegistry`,
one page per call, and flattens the two arrays together. tests/helpers/registry-oracle.ts
already exports a `REGISTRY` built the same way (`parseRegistry` over the
diagnostics registry pages) but wider — it reads all four sharded pages
(`code-registry-{parse,load,runtime,host}.md`), joined before one parse call —
and both of the codes b0275 looks up (`theta/load/callee-has-errors`,
`theta/load/invoke-path-escape`) live on the `code-registry-load.md` page that
module's four-page union already includes. b0275 imports nothing from
tests/helpers/registry-oracle.ts.

## Evidence

tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:192-205 — the
local declaration:
```ts
interface RegistryRow {
  code: string;
  severity: string;
  phase: string;
  message: string;
}

const REGISTRY = ["code-registry-parse.md", "code-registry-load.md"].flatMap((page) =>
  parseRegistry(
    readFileSync(
      fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
      "utf8",
    ),
  ) as RegistryRow[],
);
```

tests/helpers/registry-oracle.ts:21-38 — the canonical helper solving the
identical problem (parse the sharded diagnostics registry pages into one
`RegistryRow[]` through the real `parseRegistry`), superset-shaped so a
narrower per-file `RegistryRow` view (as b0275's own four fields already are)
reads it without change:
```ts
export interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
export const REGISTRY: readonly RegistryRow[] = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];
```

Pattern-wide search: `grep -rl '\["code-registry-parse.md",
"code-registry-load.md"\]' tests --include="*.test.ts"` → 9 files, including
tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts,
tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts,
tests/callee-post-parse-errors-un-register-tools-caller.test.ts,
tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts,
tests/shared-subtree-judged-once-per-pass-not-once-per-path.test.ts and
tests/nested-tools-entry-containment.test.ts. The narrower `.flatMap((page)
=>` variant of the same read recurs identically in 5 of those files, including
b0275; `diff` against tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts's
own `RegistryRow`/`REGISTRY` declaration shows zero differences from the
excerpt quoted above.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: b0275's `RegistryRow`/
`REGISTRY` read solves the exact problem tests/helpers/registry-oracle.ts was
built to centralise — parse the sharded diagnostics-registry markdown pages
into one row array through `parseRegistry`, once, for the whole file to query
— and does so with its own `readFileSync`/`fileURLToPath`/`parseRegistry`
call chain instead of importing the existing export. The two codes this file
actually looks up both live on a page the canonical `REGISTRY` already
includes, so the helper "clearly could" serve this file's need in full; the
two-page/`.flatMap` shape is a narrower, independently-authored path to the
same array the four-page/`.join` helper already builds.

## Suggested direction (non-binding, optional)
tests/helpers/registry-oracle.ts already exports a `REGISTRY` covering every
page and code this file reads; it is the existing home for the read this file
still performs locally.

## False-positive check
- Gate-pin: tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts
  does not match `*gate*.test.ts` or the named kin; not applicable, and the
  cited lines are a data read, not a pinned-count assertion.
- Recording-double: `REGISTRY` is a static, parsed-once array; nothing here
  records a call or backs a "never called" assertion, so the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0275-escaping-tools-entry-below-immediate-callee-silent-at-caller.md
  Status "fixed (0.274.0)". `npx vitest run
  tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts` → 5 passed
  (5) at HEAD, so this is not a documented correct-reason red. `grep -rl
  "registry-oracle" docs/bugs/` → only docs/bugs/0123-match-pattern-decrement-draws-neighbouring-codes.md,
  which does not discuss b0275 or state a rationale for per-file registry
  reads.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0275-escaping-tools-entry-below-immediate-callee"
  docs/reference/coverage-matrix.md` → 0 hits; no other docs/bugs/ document
  cites this file by name. This finding proposes no merge, rename or deletion
  of the file or any `it()`/`describe()` — only that the local `RegistryRow`/
  `REGISTRY` read could be replaced by the existing import — so no citation is
  affected.
- Overlap check against this same wave's other D7 candidates: this finding's
  cited range (192-205) is the `RegistryRow`/`REGISTRY` declaration only; the
  sibling candidate qw20260912091742-d7-02-b0275-load-pass-diagnostic-harness-duplicated.md
  covers this same file's `normativeMessagePattern`/`runLoadPass`/`noteDiagnostics`/
  `allDiagnostics`/`describeNotes`/`errorRowsAt`/`errorFilesOf`/`requireDriven`
  bundle at lines 214-225 and 281-340 under a separate root cause (no existing
  canonical helper for that bundle, versus this finding's existing
  tests/helpers/registry-oracle.ts). The two findings cite disjoint line ranges.
- Coverage check: the claim is about a repeated read/parse DEFINITION, not a
  missing test path; the registry read is exercised by every test in the file.

## Triage
verdict: confirmed — every excerpt reproduces exactly (b0275:192-205 interface+REGISTRY; registry-oracle.ts:21-38), the 9-file/5-flatMap pattern-search counts and the zero-diff against b0280 reproduce, both looked-up codes (theta/load/callee-has-errors, theta/load/invoke-path-escape) verified present on code-registry-load.md which the shared four-page REGISTRY already includes, b0275 imports nothing from the helper, no gate-pin/documented-rationale/coverage-matrix carve-out applies (docs/bugs/0275 fixed 0.274.0, 5/5 vitest passing, registry-oracle grep hits only unrelated 0123), the disjoint-range overlap claim against sibling qw20260912091742-d7-02 checks out, and this is not covered by resolved PTQ-0215 (scoped to three different, already-migrated files) or any other existing PTQ — genuine D7 copy-paste-fixture duplication of the already-centralised tests/helpers/registry-oracle.ts (triage: claude-opus-5)
