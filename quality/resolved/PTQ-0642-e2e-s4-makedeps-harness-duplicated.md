---
id: PTQ-0642
title: e2e-s4-never-emitted-diagnostics.test.ts and e2e-s4-uncovered-emitted-diagnostics.test.ts redeclare the identical makeDeps production-parse harness
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/e2e-s4-never-emitted-diagnostics.test.ts:1-33
  - tests/e2e-s4-uncovered-emitted-diagnostics.test.ts:1-30
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# e2e-s4-never-emitted-diagnostics.test.ts and e2e-s4-uncovered-emitted-diagnostics.test.ts redeclare the identical makeDeps production-parse harness

## Observation
`tests/e2e-s4-never-emitted-diagnostics.test.ts` and
`tests/e2e-s4-uncovered-emitted-diagnostics.test.ts` are direct siblings in
the same e2e-campaign S4 slice (one covers registry codes the shipped tree
previously never emitted, the other covers codes that ARE emitted but had no
shape-asserting test). Both files import the identical five symbols
(`Diagnostic`, `ThetaSource`, `SystemNoteChannelDeps`, `ModelReferenceMatcher`,
`parseThetaDocument`/`ParseThetaDocumentDeps`) in the same order, and both
declare a byte-identical `makeDeps(): ParseThetaDocumentDeps` function that
wires a no-op `SystemNoteChannelDeps` and an always-resolving
`ModelReferenceMatcher`. Neither file references the other or a shared module
for this declaration.

## Evidence

`tests/e2e-s4-never-emitted-diagnostics.test.ts:1-33`:
```ts
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
} from "../src/parser/theta-document";

// S4 e2e campaign — witnesses for the ten registry diagnostic codes that the
// shipped tree previously NEVER emitted. ...

function makeDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}
```

`tests/e2e-s4-uncovered-emitted-diagnostics.test.ts:1-30` — the same five
imports in the same order, and the same `makeDeps` body verbatim:
```ts
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
} from "../src/parser/theta-document";

// S4 e2e campaign — coverage for registry diagnostic codes that ARE emitted by
// the shipped parser but had no shape-asserting test ...

function makeDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}
```

Each file then builds a thin, differently-named wrapper around
`parseThetaDocument(source, makeDeps())` — `codesOf(src)` in the
never-emitted file, `parse(src)` / `find(src, code)` in the uncovered-emitted
file — but the `makeDeps` declaration itself, the piece with no per-file
variation at all, is retyped whole in both.

## Why this is a problem
The two files are the closest possible siblings (same S4 e2e slice, same
production entry point, same diagnostics registry), yet the
zero-variation `makeDeps` wiring — a no-op system-note channel and an
always-resolving model matcher — is declared twice rather than shared. This
is the same class of "wire a no-op diagnostic sink + always-resolving model
matcher for parseThetaDocument" scaffold that recurs across the wider test
suite (the identical `function makeDeps(): ParseThetaDocumentDeps { ... }`
signature appears in roughly two dozen files repo-wide, noted for context
only — this filing's evidence and locations are limited to the two S4
sibling files, which is the pairing with the tightest shared provenance
(same campaign slice, same header framing) and no acknowledged cross-file
reference.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` export for the "no-op systemNote / always-resolving
modelMatcher `ParseThetaDocumentDeps`" wiring is the natural home the
identical five-import header in both files already points at.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin.
- Recording-double check: `makeDeps`'s `systemNote`/`modelMatcher` fields are
  inert stand-ins that record nothing and back no "never called" assertion;
  the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "e2e-s4-never-emitted-diagnostics\|e2e-s4-uncovered-emitted-diagnostics" docs/bugs/*.md` found no bug doc discussing this harness's internal duplication; the files' own headers cite `findings/s4-errors-diagnostics-findings.md` and `docs/e2e-campaign/execution/s4-errors-diagnostics-results.md` for the *behavioural* subject (which registry codes fire), not this harness.
- coverage-matrix/bug-doc citation search: `grep -n "e2e-s4-never-emitted-diagnostics\|e2e-s4-uncovered-emitted-diagnostics" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any test file or `it()`/`describe()` — only that the identical `makeDeps` declaration could be shared — so no witness-list citation is disturbed.
- Coverage check: the claim is about a repeated function DEFINITION, not a
  missing test path; `makeDeps` is exercised by every call site in both files.
- Overlap check: grepped `quality/intake` and `quality/resolved` for
  `e2e-s4-never-emitted-diagnostics` and `e2e-s4-uncovered-emitted-diagnostics`
  — no existing filing cites either file.

## Triage
<!-- appended by triage -->
verdict: confirmed — re-verified independently: both excerpts match verbatim at never-emitted:1-33 and uncovered-emitted:1-30 and the two makeDeps bodies diff byte-identical (diff exit 0); neither file imports anything from ./helpers/ while tests/helpers/e2e-s1.ts:38 already exports the value-identical parseDeps() (inertSystemNote + resolvingMatcher, same commit 2026-07-13), so the fix is a mechanical import; repo-wide `function makeDeps(): ParseThetaDocumentDeps` = 25 files, matching the "roughly two dozen" context claim; no gate/recording-double/red carve-out applies (both files plain it(), no it.fails/skip), coverage-matrix 0 hits, no intake/issues/resolved filing cites either file, and this is a distinct file pair from the same-class resolved PTQ-0214/0314/0386/0405 (per-file-pair convention); two peripheral inaccuracies noted — the direction paragraph proposes a helper that already exists, and the docs/bugs "no hits" claim is false (fixed bugs 0013 and 0025 cite the files for behaviour at :53-54, not the harness) — neither touches the anchor (triage: claude-fable-5-1)
