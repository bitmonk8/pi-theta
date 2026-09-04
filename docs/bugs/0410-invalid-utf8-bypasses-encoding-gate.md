# Bug 0410 — `parseThetaDocument` decodes source bytes with a non-fatal `TextDecoder` before any UTF-8 validation runs, so `theta/load/invalid-encoding` is unreachable on the production path: an invalid byte inside a string literal loads with ZERO diagnostics and silently binds U+FFFD mojibake, and a UTF-16LE file draws 49 `unsupported-feature`/`unknown-identifier` errors instead of the pinned code at byte offset 0

- **Status:** fixed (0.410.0).
- **Sev/Diff estimate:** S1/D2 — invalid bytes silently bind U+FFFD mojibake with zero diagnostics on the only production parse path; fix hoists the existing validator into `parseThetaDocument` plus a refused-document arm and intake tests, one subsystem.
- **Kind:** defect — implementation diverges from a stated rule
  (`docs/spec_topics/lexical.md:5` §Encoding), plus a test-infrastructure
  remark: the committed intake gate witnesses only the bypassed seam.
- **Related:**
  - [0246](./0246-unterminated-query-template-registered-unfired.md) —
    registered-but-unreachable dead-gate class precedent. Distinction: there
    the pinned code has no firing emitter; here the emitter exists and is
    correct (`lexer.ts:101`) — its input is laundered before it runs.
  - Otherwise none filed on encoding intake. The lexer-side validator and its
    tests shipped with V1a and have been green throughout; no report covers
    the whole-document path.
- **Affected** (verified at c2c25d81, v0.398.0):
  - `src/parser/theta-document.ts:978` — `parseThetaDocument` starts with
    `const text = decodeSource(source.bytes)`; no validation precedes it.
  - `src/parser/theta-document.ts:1622-1633` — `decodeSource` decodes with
    `new TextDecoder("utf-8", { ignoreBOM: true })` (non-fatal: invalid
    sequences are silently replaced by U+FFFD), then normalises newlines.
  - `src/parser/theta-document.ts:1002` — the lexer is fed
    `encodeSource(split.bodyText)`: a RE-ENCODING of the already-decoded,
    already-replaced text, which is always valid UTF-8, so
    `lexTheta`'s `firstInvalidUtf8Offset(source.bytes)` check
    (`src/lexer/lexer.ts:101`, validator at `:226`) can never fault there.
  - `src/extension/pass-parse-cache.ts:116,155` — the only production callers
    of `parseThetaDocument`; `parseDiscoveredTheta`
    (`src/extension/production-composition.ts:3552-3563`) hands
    `fs.readBytes` output straight to `parseViaPassCache`. `grep -rn
    "lexTheta(" src/` shows every production `lexTheta` call receives
    re-encoded text (`theta-document.ts:1002,1493,1522,9669`) — no production
    call site passes raw file bytes.
- **Observed at:** 0.398.0 (c2c25d81), offline — `parseDocBytes` /
  `lexBytes` drivers from `tests/helpers/e2e-s1.ts` (the shipped
  `parseThetaDocument` and `lexTheta` entry points, inert note channel).

## Summary

lexical.md pins one disposition for non-UTF-8 input: load-time error
`theta/load/invalid-encoding` with the zero-based byte offset of the first
invalid byte, offset 0 for a non-UTF-8 BOM, and — explicitly — "a
Notepad-style UTF-16 save fails fast rather than producing mojibake"
(`lexical.md:5`). The lexer implements exactly this (`lexer.ts:100-113`) and
the intake tests prove it — but only when `lexTheta` is handed the raw file
bytes. The production pipeline never does that: `parseThetaDocument` decodes
first with a replacement-character decoder, then re-encodes the decoded text
for the lexer. The validation therefore runs on bytes that are valid by
construction. Invalid input takes one of two wrong paths:

1. Invalid bytes inside string/template/frontmatter content: the file loads
   with zero diagnostics, registers, and the affected literal silently carries
   U+FFFD — mojibake bound into values that reach prompts and wire schemas.
2. Invalid bytes in code position (e.g. an entire UTF-16 file): dozens of
   `theta/parse/unsupported-feature` / `theta/parse/unknown-identifier`
   errors about stray NUL-adjacent characters — the registered code never
   fires, the offset is never reported.

## Reproduction

Offline, via `tests/helpers/e2e-s1.ts` drivers (`parseDocBytes` = shipped
`parseThetaDocument`; `lexBytes` = shipped `lexTheta`):

(a) Invalid byte 0xFF inside a string literal (zero-based offset 31):

```ts
const b = concat(utf8('---\nmode: prompt\n---\nlet s = "a'), [0xff], utf8('b"\ns\n'));
parseDocBytes(b).diagnostics   // []            ← loads clean
// string literal value now contains U+FFFD (verified via JSON of the body AST)
lexBytes(b).diagnostics        // [theta/load/invalid-encoding]  "byte offset 31"
```

(b) Lone surrogate ED A0 80 in the same position: same split — document path
`[]`, lexer path `theta/load/invalid-encoding` at byte offset 32 (the
three-byte sequence's own first byte).

(c) UTF-16LE file (BOM FF FE, then `---\nmode: prompt\n---\nlet x = 1\n` in
UTF-16LE): document path emits 49 diagnostics, all
`theta/parse/unsupported-feature` or `theta/parse/unknown-identifier`;
lexer path emits exactly `theta/load/invalid-encoding` … "byte offset 0".

## Expected behaviour

`lexical.md:5`: "Any other BOM, or any byte sequence that is not valid UTF-8
(including lone surrogates), is a load-time error
`theta/load/invalid-encoding` reporting the file path and the zero-based byte
offset of the first invalid byte in the original (pre-normalisation) file
content; for a non-UTF-8 BOM the reported offset is `0` … a Notepad-style
UTF-16 save fails fast rather than producing mojibake." The same bullet pins
the mechanism: source bytes are "UTF-8-validated by the runtime **before**
decoding, which is what makes the pre-decode byte sequence — and hence the
first-invalid-byte offset above — observable."

## Actual behaviour / root cause

`decodeSource` (`theta-document.ts:1622`) decodes before any validation, with
a non-fatal decoder that substitutes U+FFFD per WHATWG replacement semantics.
Its own docstring reads "Decode validated UTF-8 body bytes"
(`theta-document.ts:1621`) — a precondition no production caller honours.
Every downstream consumer — `splitFrontmatter`, the frontmatter YAML parse,
`scanDocComments`, and the lexer itself (via the `encodeSource` round-trip at
`:1002`) — sees only the laundered text. `lexTheta`'s validation
(`lexer.ts:101`) is correct but production-unreachable with raw bytes: its
only raw-bytes production caller is `parseThetaDocument`'s re-encoded feed.

Test-infrastructure remark: the intake gate
(`tests/e2e-s1-lexer-intake.test.ts:34-46`, REQ-LEX-3) drives `lexBytes` —
the lexer seam directly — so the suite is green while the only production
entry (`parseViaPassCache` → `parseThetaDocument`) exhibits the divergence.
The gate cannot witness the behaviour it names for the shipped pipeline.

## Why it matters

- Silent wrong values (impact class 1): a truncated or corrupted-on-disk
  `.theta` (bad merge, wrong-encoding editor save, partial write) registers
  and runs with U+FFFD substituted into string literals, template prose, and
  frontmatter scalars — bytes the author never wrote reach prompts, binder
  envelopes, and lowered schema descriptions with zero diagnostics.
- The spec's named scenario (UTF-16 save) produces a wall of misleading parse
  errors pointing at "stray" characters, none naming the actual fault or the
  offset the spec promises; the pinned code exists in the registry and the
  lexer but is dead on the production path.

## Non-goals

- The lexer-side validator's own correctness (`firstInvalidUtf8Offset` is
  conformant, including the surrogate and truncation arms).
- BOM handling for valid UTF-8 (leading BOM strip works; spans conform).
- CRLF/LF normalisation parity (probed byte-identical end-to-end, separate
  clean result).

## Fix

Options:

1. Validate raw bytes at the top of `parseThetaDocument`: run the existing
   validator over `source.bytes` before `decodeSource`; on fault, emit the
   `theta/load/invalid-encoding` diagnostic (same message shape as
   `lexer.ts:105-108`) through `deps.systemNote` and return a refused
   document (no frontmatter, no statements, `ok=false`-equivalent). Requires
   exporting `firstInvalidUtf8Offset` (or hoisting it to a shared module).
   No double-emission risk: the later `lexTheta` call sees valid re-encoded
   bytes and stays silent. Recommended.
2. Switch `decodeSource` to `TextDecoder("utf-8", { fatal: true })` with a
   catch. Rejected as sole fix: the thrown `TypeError` carries no byte
   offset, so the spec's first-invalid-byte report is unimplementable; would
   still need option 1's scan on the failure path.

Any fix must keep: (i) the offset judged on original pre-normalisation bytes;
(ii) offset 0 for a non-UTF-8 BOM; (iii) leading UTF-8 BOM accepted; and
(iv) an intake test that drives `parseThetaDocument` (not only `lexTheta`)
with invalid bytes, both the silent-content case and the UTF-16 case.

## Provenance

- Hunt area: lexer-input-edges (source-level input edge classes).
- Probes: throwaway `tests/scratch-lexinput.test.ts` (deleted), cases A1-A3;
  outputs quoted verbatim in §Reproduction.
- Spec read: `docs/spec_topics/lexical.md` (whole page), `grammar.md`
  §Newline continuation, `query/query-forms.md` §Dedent and newline-trim.

## Fix (0.410.0)

- What shipped:
  - `src/lexer/lexer.ts` — `export`ed `firstInvalidUtf8Offset` (the existing
    UTF-8 validator, logic unchanged) so the whole-document path can reuse it
    (option 1: "Requires exporting `firstInvalidUtf8Offset`").
  - `src/parser/theta-document.ts` — pre-decode gate at the top of
    `parseThetaDocument`, BEFORE `decodeSource`: `firstInvalidUtf8Offset(source.bytes)`
    over the raw bytes; on fault emits `theta/load/invalid-encoding` (message
    `invalid UTF-8 encoding at byte offset <offset>`, matching the lexer
    emitter) through `deps.systemNote` via `emitDiagnosticBatch` and returns a
    refused document (`frontmatter: null`, empty body, the diag in both
    `diagnostics` and `deliveredDiagnostics`). No double-emission: the later
    `lexTheta` sees valid re-encoded bytes and stays silent. Two `ThetaDocument`
    docstrings reworded (deliverer attribution + the one fast-fail exception).
    Constraints kept: (i) offset on original pre-normalisation bytes;
    (ii) offset 0 for a non-UTF-8 BOM; (iii) leading UTF-8 BOM accepted;
    (iv) an intake test drives `parseThetaDocument` for both the silent-content
    and UTF-16 cases.
- Gates:
  - Witness `tests/b0410-encoding-gate-document-path.test.ts`: RED at fork
    (a) `codes []`, (c) `codes [theta/parse/unknown-identifier,
    theta/parse/unsupported-feature]`; GREEN after fix (3 passed); BOM control
    green both directions. Revert-witness: byte-exact restore
    (`git hash-object` matched), RED<->GREEN reversible.
  - Full default suite: green (570 baseline files + this witness file); the
    only reds were load-noise flakes in timing-sensitive discovery/subagent
    files (e.g. `shared-subtree-judged-once-per-pass`), each green isolated,
    none on the lexer/parser encoding surface.
  - `npx tsc -p tsconfig.json --noEmit`: clean. `npm run lint`: clean.
- Review: 1 round. `bug-fix-reviewer` round 1 — one `prose` finding (the
  `deliveredDiagnostics` docstring named `lexTheta` as sole deliverer, now
  false); fixed comment-only by `bug-fix-fixer-light`; polish verified by
  gate-diff (comment-only hunks, gates green), confirmation round skipped. No
  correctness/fidelity/spec findings.
- Verification: `bug-fix-verifier` SOLID. Obligation 1 (witness reverses):
  byte-exact restore, RED for the right reason, GREEN after. Obligation 2
  (full suite): green modulo named load-noise flakes. Obligation 3 (live):
  adjacent existing intake cell `b0263live-frontmatter-yaml-parse-failure`
  (same load-time document-intake refusal channel) PASSED under a real host
  (9.5s) under the global live lock — a new live cell is NOT owed: the change
  alters only the invalid-UTF-8 refusal arm, a committed invalid-UTF-8 fixture
  is infeasible (it would trip `committed-fixture-parse-gate`), the class is
  witnessed offline at the exact production entry point, and valid-input
  registration is byte-identical. Obligation 4 (lint+typecheck): clean.
- Residuals: none.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: `theta/load/invalid-encoding` is a
  pre-existing registered code — no registry edit and no permitted-codes
  change owed. Non-goals (validator correctness, valid-UTF-8 BOM handling,
  CRLF/LF parity) untouched. `pass-parse-cache.ts` / `production-composition.ts`
  (listed callers) not edited — the fix is internal to `parseThetaDocument`.
