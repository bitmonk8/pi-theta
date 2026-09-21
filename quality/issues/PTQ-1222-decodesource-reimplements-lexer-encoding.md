---
id: PTQ-1222
title: theta-document's decodeSource re-hand-rolls decodeUtf8 + normaliseNewlines that src/lexer/encoding.ts already exports
lens: D8
status: open
verdict: confirmed
locations:
  - src/parser/theta-document.ts:1381-1391
  - src/lexer/encoding.ts:104-120
  - src/lexer/lexer.ts:23
sites: 1
fix_scope: module
d8_class: reimplemented
d8_host: src/parser/theta-document.ts#decodeSource
wave: qw20260921183818
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# theta-document's decodeSource re-hand-rolls decodeUtf8 + normaliseNewlines that src/lexer/encoding.ts already exports

## Observation
`parseThetaDocument` decodes raw bytes through a private `decodeSource` (theta-document.ts:1381-1391) whose body is the exact composition of two functions the lexer package already exports: `decodeUtf8` (BOM-skipping `TextDecoder` decode) and `normaliseNewlines` (`\r\n?` → `\n`), both defined in `src/lexer/encoding.ts:104-120` and re-exported from `src/lexer/lexer.ts:23`. theta-document already imports from both modules (`lexTheta` from `../lexer/lexer` at line 25, `validateUtf8Encoding` from `../lexer/encoding` at line 26), so the facility is one named import away on an existing edge.

## Evidence
Hand-rolled copy — src/parser/theta-document.ts:1381-1391 (re-read before filing):
```ts
function decodeSource(bytes: Uint8Array): string {
  const hasBom =
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf;
  const body = hasBom ? bytes.subarray(3) : bytes;
  return new TextDecoder("utf-8", { ignoreBOM: true })
    .decode(body)
    .replace(/\r\n?/g, "\n");
}
```
The facility — src/lexer/encoding.ts:104-120 (re-read before filing):
```ts
export { decodeUtf8, normaliseNewlines };

/** Decode validated UTF-8 bytes, skipping a leading UTF-8 BOM. */
function decodeUtf8(bytes: Uint8Array): string {
  const hasBom =
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf;
  const body = hasBom ? bytes.subarray(3) : bytes;
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(body);
}

/** Normalise `\r\n` and bare `\r` to `\n` (lexical.md §Newline normalisation). */
function normaliseNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
```
Feature-for-feature: `decodeSource(bytes)` ≡ `normaliseNewlines(decodeUtf8(bytes))` — the BOM test, the `TextDecoder("utf-8", { ignoreBOM: true })` construction, and the `\r\n?` regex are character-for-character the same. The lexer's own pipeline composes exactly these two: `src/lexer/lexer.ts:112` `const text = normaliseNewlines(decodeUtf8(source.bytes));`. `decodeSource` has one caller (theta-document.ts:186), so its call site's real need is exactly the composition the facility already provides.

## Why this is a problem
Two copies of the same decode+normalise ritual now exist on the two entry seams of the same pipeline (`lexTheta` and `parseThetaDocument`), the same shape PTQ-1113 (resolved) removed for the sibling UTF-8-validation gate — that fix consolidated `firstInvalidUtf8Offset`/`validateUtf8Encoding` into `encoding.ts` and left this pair behind. A future change to BOM or newline handling (lexical.md §Encoding / §Newline normalisation both pin these) must be made twice or the two seams silently diverge on what text the parser and the lexer each see.

## Suggested direction (non-binding, optional)
Unproven hypothesis: import `decodeUtf8` and `normaliseNewlines` (already re-exported from `../lexer/lexer`, which theta-document imports) and delete `decodeSource`, mirroring how the PTQ-1113 fix consolidated the validation gate.

## False-positive check
Reference search: `decodeSource` has exactly one caller (theta-document.ts:186) and no test/string-keyed references (grep across src/); `decodeUtf8`/`normaliseNewlines` are exported from encoding.ts:104 and re-exported from lexer.ts:23, so no export needs widening. Not dead code (D2) — the copy is live; the claim is the hand-rolled duplication of an existing facility. Not a duplicate filing: PTQ-1113 (resolved) covered only the `firstInvalidUtf8Offset` gate clone; PTQ-1156/PTQ-1166 (D9) list `decodeSource` only as a row in a file-level concern inventory, not this reimplementation claim — cross-referenced, distinct d8 claim. No D8 exemption exists for this host. Spec check: lexical.md pins the behaviour, not the residence; consolidating drops no clause.

## Triage
verdict: questionable — accounting verified at HEAD: decodeSource excerpt byte-exact at theta-document.ts:1381-1391 (header comment 1380), decodeUtf8/normaliseNewlines byte-exact at encoding.ts:104-120, re-exported at lexer.ts:23 and composed identically at lexer.ts:112; the facility covers every cited need (same BOM test, same non-fatal `TextDecoder("utf-8", { ignoreBOM: true })` the 169-175 comment relies on, same `\r\n?` regex — no load-bearing difference); grep across src/extensions/tools/tests shows decodeSource's sole caller is theta-document.ts:186 (the tests/b0410 hit is prose), theta-document already imports from both ../lexer/lexer and ../lexer/encoding; no D8 exemption for the host in quality/exemptions.json or `exemptions --lens D8`; spec check clean — lexical.md §Encoding/§Newline normalisation pin behaviour, and the named shape preserves it; dedupe clean — PTQ-1113 (resolved) covered only the UTF-8 gate, PTQ-1156/PTQ-1166 (resolved D9) name decodeSource only as an inventory row; D8 never confirms — the consolidation is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): confirmed - D8 wave-1 batch ruling; triage equivalence verification trusted.
