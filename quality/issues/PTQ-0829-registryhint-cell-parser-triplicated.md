---
id: PTQ-0829
title: registryHint's markdown-table-cell parser is redeclared byte-for-byte in three test files, one of which names this file's copy as its own mirror
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/match-pattern-increment-decrement.test.ts:137-160
  - tests/increment-decrement-wiring.test.ts:134-157
  - tests/tools-entry-grammar-derivations-lockstep.test.ts:1168-1203
sites: 3
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# registryHint's markdown-table-cell parser is redeclared byte-for-byte in three test files, one of which names this file's copy as its own mirror

## Observation
`tests/match-pattern-increment-decrement.test.ts` declares a module-scope `registryHint(code)` that splits `code-registry-parse.md` into lines, keeps the ones starting with `|`, splits each into cells on an unescaped `|`, unescapes `\|`, finds the row whose first cell is the backticked code, and reads cell index 5 (the *Hint* column), throwing if the cell is absent/empty/`—` or the row itself is absent. `tests/increment-decrement-wiring.test.ts` declares a `registryHint` whose cell-splitting body (the `for`/`trim`/two `.replace`/`.split(/(?<!\\)\|/)`/`.map` sequence and the `hint === undefined || hint === "" || hint === "—"` guard) is byte-identical, differing only in the two error-message strings. `tests/tools-entry-grammar-derivations-lockstep.test.ts` declares a third copy over `code-registry-load.md` with the identical cell-splitting body (plus one extra `.replace`/`.replaceAll` step to strip markdown link/backtick markup from the returned hint), and its own doc comment names the first file's copy by symbol as the shape it is applying: "the `registryHint` shape of tests/match-pattern-increment-decrement.test.ts, whose `HINT_CELL_INDEX` is this same column 5".

## Evidence

tests/match-pattern-increment-decrement.test.ts:137-160:
```ts
const HINT_CELL_INDEX = 5;

function registryHint(code: string): string {
  for (const line of REGISTRY_TEXT.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|\s*$/, "")
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim().replace(/\\\|/g, "|"));
    if (cells[0] !== `\`${code}\``) continue;
    const hint = cells[HINT_CELL_INDEX];
    if (hint === undefined || hint === "" || hint === "—") {
      throw new Error(
        `harness: the ${code} row at ${REGISTRY_PARSE_PAGE} carries no Hint cell (cell ${HINT_CELL_INDEX} is ${JSON.stringify(hint)}) — route (a) emits this Hint verbatim, so an empty cell is a harness failure, never a skip`,
      );
    }
    return hint;
  }
  throw new Error(
    `harness: ${REGISTRY_PARSE_PAGE} carries no row for ${code} — this file's Hint oracle is stale`,
  );
}
```

tests/increment-decrement-wiring.test.ts:134-157 (the cell-splitting body is byte-identical; only the two thrown strings differ):
```ts
const HINT_CELL_INDEX = 5;

function registryHint(code: string): string {
  for (const line of REGISTRY_TEXT.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|\s*$/, "")
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim().replace(/\\\|/g, "|"));
    if (cells[0] !== `\`${code}\``) continue;
    const hint = cells[HINT_CELL_INDEX];
    if (hint === undefined || hint === "" || hint === "—") {
      throw new Error(
        `harness: the ${code} row at docs/spec_topics/diagnostics/code-registry-parse.md carries no Hint cell (cell ${HINT_CELL_INDEX} is ${JSON.stringify(hint)}) — bug 0084 reports the absent hint as half the defect, so an empty cell is a harness failure, never a skip`,
      );
    }
    return hint;
  }
  throw new Error(
    `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no row for ${code} — this file's Hint oracle is stale`,
  );
}
```

tests/tools-entry-grammar-derivations-lockstep.test.ts:1163-1203 (own comment names the first file's symbol as the applied shape; cell-splitting body byte-identical apart from the trailing markup strip):
```ts
 * Hint (the `registryHint` shape of
 * tests/match-pattern-increment-decrement.test.ts, whose `HINT_CELL_INDEX` is
 * this same column 5). Never pasted prose.
 */
const HINT_CELL_INDEX = 5;
...
function registryHint(code: string): string {
  for (const line of LOAD_REGISTRY_TEXT.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|\s*$/, "")
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim().replace(/\\\|/g, "|"));
    if (cells[0] !== `\`${code}\``) continue;
    const hint = cells[HINT_CELL_INDEX];
    if (hint === undefined || hint === "" || hint === "\u2014") {
      throw new Error(...);
    }
    return hint.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replaceAll("`", "");
  }
  throw new Error(...);
}
```

Exact search run: `grep -rn "function registryHint\|HINT_CELL_INDEX" tests/*.test.ts` returns the three declarations above (once each) and no `tests/helpers/*.ts` declaration of either name; `readRegistry` (`tests/helpers/registry-oracle.ts`) structures `RegistryRow` with `severity`/`phase`/`trigger`/`message` fields only and carries no `hint` field, so none of the three files can source this cell from the existing shared registry read.

## Why this is a problem
The seven-line cell-splitting body — line filter, the two boundary `.replace`s, the unescaped-pipe `.split`, the per-cell trim/unescape `.map`, the code-column match, and the empty/em-dash guard — is copied rather than shared, and the third file's own comment states outright that it is applying "the `registryHint` shape of" the first file, i.e. the duplication is acknowledged in the code itself rather than accidental convergence. No `tests/helpers/*.ts` module exports a Hint-column reader, so each of the three files re-derives the same markdown-table parse to reach a column `parseRegistry`/`readRegistry` drops.

## Suggested direction (non-binding, optional)
A shared Hint-column reader parameterised by registry page and `HINT_CELL_INDEX` would let these three call sites (and the load-registry variant) hold one copy of the cell-splitting body; the natural home is beside `readRegistry` in `tests/helpers/registry-oracle.ts`, which already reads the raw page text before handing it to `parseRegistry`.

## False-positive check
Gate-pin: none of the three files matches `*gate*.test.ts` or the named gate/census kin; `tests/b0269-params-type-quoted-scalar-rule-gate.test.ts` was checked separately and does not declare `registryHint`/`HINT_CELL_INDEX` (its own "Hint cell" text is unrelated prose), so it is not among the cited sites and the gate carve-out is moot. Recording-double: `registryHint` reads static markdown text and asserts nothing about calls; it is not a MUST-NOT witness, so the recording-double carve-out does not apply. Docs/bugs signature search: `grep -rln "registryHint" docs/bugs/` → 0 hits, so no documented correct-reason red matches this shape. Coverage-matrix/bug-doc citation search: `grep -n "match-pattern-increment-decrement\|increment-decrement-wiring\|tools-entry-grammar-derivations-lockstep" docs/reference/coverage-matrix.md` → 0 hits; this finding does not propose merging, renaming, or deleting any of the three files or their `it()` cells, only naming the shared parsing body as a candidate shared helper, so no pinned-citation conflict arises. This is a code-duplication claim about test harness code, not a coverage gap: no assertion here is about a missing test.

## Triage
verdict: confirmed — independently re-verified: all three excerpts reproduce at the cited lines; sed-extracting the 12-line for/trim/replace/split/map/guard body from match-pattern-increment-decrement:139-150 and increment-decrement-wiring:136-147 and diffing → zero diff, and tools-entry-grammar-derivations-lockstep:1179-1190 differs only by LOAD_REGISTRY_TEXT, the `\u2014` spelling of the same em-dash and its trailing link/backtick strip (its :1163-1165 comment really names the first file's `registryHint` shape); `grep "function registryHint\|HINT_CELL_INDEX"` → exactly these three declarations and none in tests/helpers/, RegistryRow in tests/helpers/registry-oracle.ts carries no hint field (file has zero "hint" hits); every copy is live (:244/:413, :224/:521, :1337); docs/bugs 0 hits, coverage-matrix 0 hits, no gate/recording-double/failLoudly carve-out; not a duplicate — PTQ-0646's triage note explicitly leaves the raw Hint-column read outside its DiagShape/readRepoFile fix and PTQ-0777 is the readFileSync+parseRegistry read, not a cell parser; title's "byte-for-byte" overstates (error strings and the third copy's markup strip differ) but the Observation states the deltas accurately — non-blocking (triage: claude-fable-5-1)
