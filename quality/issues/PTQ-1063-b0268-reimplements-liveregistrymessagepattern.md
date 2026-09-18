---
id: PTQ-1063
title: b0268live re-parses the registry and rebuilds the DIAG-4 message-pattern regex locally instead of importing liveRegistryMessagePattern
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:
  - tests/live/b0268live-load-note-path-spelling-live-cell.test.ts:166-192
  - tests/helpers/live-diagnostic-oracle.ts:71-82
  - tests/helpers/compose-workspace-harness.ts:393-408
  - tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts:117-122
  - tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts:196
sites: 2
fix_scope: module
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# b0268live re-parses the registry and rebuilds the DIAG-4 message-pattern regex locally instead of importing liveRegistryMessagePattern

## Observation
`tests/helpers/live-diagnostic-oracle.ts` exports
`liveRegistryMessagePattern(bugId, shard)`, which reads the named registry
shard through `readRegistry` and returns a `(code) => RegExp` built by
`compose-workspace-harness.ts`'s `normativeMessagePattern`: escape the
registry Message's regex metacharacters, then open the `<placeholder>` slots
to `.+`, failing loudly by name when the row is missing. This review's
sibling file `b0267live-…` imports and uses that export directly
(`liveRegistryMessagePattern("bug-0267", "load")`). `b0268live-…`, in the
same review scope, does not import it: it re-parses the registry page itself
with `parseRegistry`/`registryMessage` from `tools/code-registry/index.js`
and declares its own local `normativeMessagePattern(code)` function whose
body performs the identical escape-then-open-placeholders regex construction
and the identical fail-loudly-on-missing-row behaviour.

## Evidence

`tests/helpers/live-diagnostic-oracle.ts:71-82` (re-read immediately before
filing):
```ts
export function liveRegistryMessagePattern(
  bugId: string,
  shard: "load" | "parse",
): (code: string) => RegExp {
  const registry = readRegistry([shard]);
  return (code) => normativeMessagePattern(registry, code, () => {
    failLoudly(
      `${bugId} live cell precondition unmet: ` +
        `docs/spec_topics/diagnostics/code-registry-${shard}.md carries no Message row for ` +
        `${code} — the DIAG-4 column is this cell's only message oracle, so a missing row ` +
        "is a harness failure, never a skip",
    );
  });
}
```

`tests/helpers/compose-workspace-harness.ts:393-408` (the shared regex-build
logic `liveRegistryMessagePattern` delegates to):
```ts
export function normativeMessagePattern(
  registry: readonly { readonly code: string; readonly message: string }[],
  code: string,
  onMissing?: () => never,
): RegExp {
  const message = registryMessage(registry, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    if (onMissing !== undefined) onMissing();
    throw new Error(
      "harness: the docs/spec_topics/diagnostics/ registry pages carry no Message row for " +
        `${code} — the DIAG-4 column is this file's only message oracle, so a missing row ` +
        "is a harness failure, never a skip",
    );
  }
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/<[a-z-]+>/g, ".+"));
}
```

`tests/live/b0268live-load-note-path-spelling-live-cell.test.ts:166-192`
(re-read immediately before filing — the local reimplementation, same
escape-and-open regex construction and the same fail-loudly-on-missing
message):
```ts
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

function normativeMessagePattern(code: string): RegExp {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    failLoudly(
      "bug-0268 live cell precondition unmet: " +
        "docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row for " +
        `${code} — the DIAG-4 column is this cell's only message oracle, so a missing row ` +
        "is a harness failure, never a skip",
    );
  }
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/<[a-z-]+>/g, ".+"));
}
```

`tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts:117-122`
(the sibling in this same review scope, importing the canonical export):
```ts
import {
  liveRegistryMessagePattern,
  renderedRows,
  rowsLocatedAt,
  requireNoteChannel,
  type RenderedRow,
} from "../helpers/live-diagnostic-oracle";
```
and at line 196: `const normativeMessagePattern = liveRegistryMessagePattern("bug-0267", "load");`

## Why this is a problem
`b0268live-…` builds its own `RegistryRow` interface, its own `readFileSync`
of a `docs/spec_topics/diagnostics/` page, and its own escape-and-open regex
construction with its own fail-loudly wording, reproducing exactly what
`liveRegistryMessagePattern` plus `normativeMessagePattern` already do for
the sibling file `b0267live-…` filed in this same review scope. A change to
the escaping rule, the placeholder syntax, or the fail-loud wording needs the
identical hand-edit applied in both places, with nothing to signal the copy
left behind.

## Suggested direction (non-binding, optional)
`tests/helpers/live-diagnostic-oracle.ts`'s `liveRegistryMessagePattern`
already reads the `"parse"` shard this file needs (the function accepts
`"load" | "parse"`), the same export `b0267live-…` imports in this same
review scope.

## False-positive check
Gate-pin check: filename matches no `*gate*.test.ts` pattern. Recording-double
check: `normativeMessagePattern` builds a regex from a registry lookup for a
positive `.toMatch()` assertion; it records no calls and backs no "never
called" witness, so the negative-witness carve-out does not apply. Live-suite
convention check: AGENTS.md's live-suite carve-out covers `failLoudly` on a
missing provider/model as correct skip posture (both the canonical helper and
the local copy already implement that posture identically); it does not
mandate re-parsing the registry per file, so this finding does not cross that
carve-out. docs/bugs/ signature search: `grep -l "normativeMessagePattern"
docs/bugs/0268-*.md` → 0 hits; the bug document states no rationale for a
local registry-pattern reimplementation. coverage-matrix/bug-doc citation
search: `grep -n "b0268live-load-note-path-spelling-live-cell"
docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no merge,
rename or deletion of the file or its `it()` block, only that the pattern
builder could be imported instead of retyped. Prior-filing overlap check:
`grep -rl "liveRegistryMessagePattern" quality/issues/*.md
quality/resolved/*.md quality/intake/*.md` (before this filing) returned
`quality/resolved/PTQ-0479-live-cell-note-channel-extraction-duplicated.md`
only, whose own subject is note-channel extraction, a different helper and a
different root cause from this registry-message-pattern reimplementation.

## Triage
verdict: confirmed — independently re-verified: the three primary excerpts reproduce verbatim (b0268live :166-192 local `RegistryRow`/`REGISTRY = parseRegistry(readFileSync(…code-registry-parse.md))`/`function normativeMessagePattern(code)`; live-diagnostic-oracle.ts :71-84 `export function liveRegistryMessagePattern(bugId, shard)` over `readRegistry([shard])`; compose-workspace-harness.ts :393-408 `normativeMessagePattern(registry, code, onMissing?)`), and the b0267live excerpts reproduce with line drift only (import block :128-133 not :117-122, call `liveRegistryMessagePattern("bug-0267", "load")` at :232 not :196); mktemp grep-normalised diff of the computation lines (registryMessage lookup, typeof/length guard, metachar escape, `<[a-z-]+>`→`.+`) is empty after `REGISTRY`→`registry`, and the failLoudly text is byte-identical to the helper's template after `${bugId}`→`bug-0268`/`${shard}`→`parse` substitution; the local copy is live (`.toMatch(normativeMessagePattern(UNTERMINATED_TEMPLATE_CODE))` :452), the file imports nothing from live-diagnostic-oracle nor `readRegistry` (grep → 0), and it predates the export (copy 978670e0 2026-08-24 vs. `liveRegistryMessagePattern` minted e3546327 2026-09-18) so it is an unmigrated residual, not a design choice — five sibling live cells (b0267/b0270/b0271/b0275/b0280) already import the export; the helper preserves the tests/live failLoudly posture so no carve-out is crossed, no gate/recording-double/red-test applies, bug doc 0268 cites the file only as a run command (:336) and coverage-matrix → 0, no merge/rename/delete proposed; all locations under tests/, D7 boilerplate-duplication class; not a duplicate — PTQ-0902/PTQ-0908/PTQ-0921 (open) cover the OFFLINE tests/b0268-*.test.ts copies against different canonical homes, PTQ-0479 (resolved) covers this file's :208-244 note-channel extraction, PTQ-0525/0561/0562 (resolved) cover other live cells, and `grep -rl b0268live quality/{issues,resolved}` → PTQ-0479 only; the candidate's `liveRegistryMessagePattern` overlap grep also hits same-wave intake d7-01/d7-02 but those are distinct root causes (clean-stem vacuity guard, three-level chain drive harness) (triage: claude-fable-5-1)

## Fix attempts
- qw20260918202006: skipped — [PTQ-1024-clean-stem-vacuity-guard-quadruplicated.md] PTQ-1024: Shared the clean fixture and registration guard across all five files, including b0267. Assertions preserved; required gate and affected live tests passed. / PTQ-1048: Shared chain-source builders and driven-turn assertions across three files. Fixture bytes and test names preserved; required gate and affected live tests passed. / PTQ-1034: Replaced local helpers in b0351, b0357, and triage-added b0307 with canonical errorCodes imports. Assertions unchanged; required gate and affected live tests passed. / PTQ-1040: Replaced both local helpers with canonical errorCodes imports and removed orphaned Diagnostic imports. Assertions unchanged; required gate and affected live tests passed. Overall verification: TypeScript, 687 offline files (11,569 tests), and all 10 affected live files passed. No tests deleted. ||
