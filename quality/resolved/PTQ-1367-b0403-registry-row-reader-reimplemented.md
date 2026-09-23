---
id: PTQ-1367
title: "b0403 hand-rolls markdown table-row splitting and backtick-body extraction already provided by the registry-oracle helper"
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/b0403-unary-minus-message-registry-divergence.test.ts:106-161
  - tests/helpers/registry-oracle.ts:1-45
  - tools/code-registry/index.js:29-51
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# b0403 hand-rolls markdown table-row splitting and backtick-body extraction already provided by the registry-oracle helper

## Observation
`tests/b0403-unary-minus-message-registry-divergence.test.ts` needs one row of
`docs/spec_topics/diagnostics/code-registry-parse.md` (the Trigger and Message
cells for `theta/parse/non-numeric-arithmetic-operands`). Rather than call
`tests/helpers/registry-oracle.ts`'s `readRegistry(["parse"])`, which parses
the same page with the real `parseRegistry` (`tools/code-registry/index.js`)
into rows already exposing `trigger` and `message`, the file hand-writes its
own line-scan, cell-splitter, backtick-body extractor, and row locator to
reproduce the same fields.

## Evidence

`tests/b0403-unary-minus-message-registry-divergence.test.ts:106-161`:
```ts
function splitTableCells(line: string): readonly string[] {
  const inner = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|\s*$/, "");
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function extractBacktickBody(cell: string): string {
  const first = cell.indexOf("`");
  const last = cell.lastIndexOf("`");
  const body = first >= 0 && last > first ? cell.slice(first + 1, last) : cell;
  return body.replace(/\\`/g, "`");
}

interface RegistryRow {
  readonly line: number;
  readonly cells: readonly string[];
}

function locateRow(): RegistryRow {
  const lines = linesOf(readCorpus(REGISTRY_PARSE));
  const hits: RegistryRow[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) return;
    if (!trimmed.includes(`\`${ROW_CODE}\``)) return;
    hits.push({ line: index + 1, cells: splitTableCells(line) });
  });
  if (hits.length !== 1) {
    throw new Error(/* ... */);
  }
  return hits[0] as RegistryRow;
}
```
The file's own comments name the source it is re-implementing: "the
`tools/code-registry/index.js` `splitTableRow` semantics, implemented inline"
(line 108) and "the `extractMessage` semantics from
`tools/code-registry/index.js:74-79`, implemented inline" (line 122).

`tests/helpers/registry-oracle.ts:1-45` already exposes exactly the fields
`locateRow`/`splitTableCells`/`extractBacktickBody` reconstruct, sourced from
the same real production parser:
```ts
export interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

export function readRegistry(
  shards: readonly ("parse" | "load" | "runtime" | "host")[],
): readonly RegistryRow[] {
  return parseRegistry(
    shards
      .map((shard) =>
        readFileSync(
          repoFile(`docs/spec_topics/diagnostics/code-registry-${shard}.md`),
          "utf8",
        ),
      )
      .join("\n"),
  ) as RegistryRow[];
}
```

`tools/code-registry/index.js:29-51` — the same real `parseRegistry` both
`registry-oracle.ts` and b0403's inline comments cite, already producing
`trigger` and (backtick-extracted) `message` per row:
```js
export function parseRegistry(text) {
  const rows = [];
  const seen = new Set();
  for (const line of text.split("\n")) {
    const cells = splitTableRow(line);
    if (cells == null || cells.length < 5) continue;
    const codeMatch = cells[0].match(/`(theta\/[a-z0-9/_-]+)`/);
    if (codeMatch == null) continue;
    const code = codeMatch[1];
    if (seen.has(code)) continue;
    seen.add(code);
    const slash = code.indexOf("/", "theta/".length);
    const namespace = code.slice("theta/".length, slash);
    rows.push({
      code,
      namespace,
      severity: cells[1],
      phase: cells[2],
      trigger: cells[3],
      message: extractMessage(cells[cells.length - 1]),
```

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header states its purpose: "several
test files independently redeclared the same [registry] read ... this module
centralises that read". `readRegistry(["parse"])` already returns a
`RegistryRow` with `.trigger` and `.message` for the same code, parsed by the
identical production module (`tools/code-registry/index.js`) b0403's inline
functions cite by name in their own doc comments as the semantics they
reimplement. b0403's `locateRow`/`splitTableCells`/`extractBacktickBody` (56
lines, 106-161) recompute the same two fields the canonical reader already
returns, via a hand-rolled line-scan and cell-splitter rather than the
existing parse.

## Suggested direction (non-binding, optional)
Naming the natural home as observation: `readRegistry(["parse"])` from
`tests/helpers/registry-oracle.ts` already returns the `trigger`/`message`
cells this file locates by hand; the file's own line-number need (for its
failure messages) is the only thing the canonical row does not carry, and
could be derived separately from the corpus text already read for that
purpose elsewhere in the file (`diag4Run`).

## False-positive check
- Gate-pin check: `tests/b0403-unary-minus-message-registry-divergence.test.ts`
  does not match `*gate*.test.ts` or a listed gate kin; this is a bug-doc
  witness, not a census/pin test.
- Recording-double check: `locateRow` is a row-finder, not a negative-witness
  recording double.
- docs/bugs/ signature search: `docs/bugs/0403-*.md` documents the message
  divergence itself, not a sanctioned reason to hand-roll table parsing; the
  file's own comments justify the inline duplication as "so this cell owns
  its extraction," which is not one of the listed carve-outs.
- coverage-matrix/bug-doc citation search: `grep -rn "locateRow\|splitTableCells" docs/reference/coverage-matrix.md docs/bugs/*.md`
  returned no citation of these helper names.
- Confirmed the claim is about duplicated parsing logic already available via
  `tests/helpers/registry-oracle.ts`, not a coverage gap.

## Triage
<!-- appended by triage -->
verdict: confirmed — excerpts reproduce at 111/126/146; `extractBacktickBody` is byte-identical to `tools/code-registry/index.js` `extractMessage` (diffed) and `splitTableCells` is `splitTableRow` minus the separator guard, both cited by name in the file's own comments (108, 123), while `tests/helpers/registry-oracle.ts` `readRegistry(["parse"])` already yields `.trigger`/`.message` for `theta/parse/non-numeric-arithmetic-operands` via the same `parseRegistry`; no other test uses these helper names and the coverage-matrix/bug-doc grep is empty; the "so this cell owns its extraction" rationale that made the 2026-09-17 shard decline (REVIEW_LOG.md:133) is not an anti-tautology carve-out — the tool is not the SUT and the file's own header says cell D protects the registryMessage-sourcing tests that read through the real `parseRegistry`; the line-number and exactly-one-row loud precondition (parseRegistry is first-wins) are the only residue a fix must keep, and neither needs the copied cell-splitter/backtick extractor; not a duplicate of the fixed PTQ-0587 (corpus-reader) or PTQ-0788 (parseDeps) (triage: claude-fable-5-1)
