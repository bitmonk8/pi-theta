---
id: PTQ-1474
title: Reserved-keyword-list extraction from lexical.md reimplemented independently in both in-scope test files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/reserved-keyword-object-pattern-head-refusal.test.ts:214-223
  - tests/reserved-keyword-type-position.test.ts:149-172
sites: 2
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# Reserved-keyword-list extraction from lexical.md reimplemented independently in both in-scope test files

## Observation
Both test files need the same oracle value — the current 32-spelling reserved-keyword list read live off `docs/spec_topics/lexical.md`'s "**Reserved keywords.**" sentence, rather than a restated literal — so that a spec edit reds the test instead of silently narrowing coverage. Each file declares its own top-level function that reads the file, locates the same sentence, and regex-extracts the backtick-quoted words, with its own throw-if-anchor-missing guard carrying near-identical wording.

## Evidence
tests/reserved-keyword-object-pattern-head-refusal.test.ts:214-223
```ts
function specReservedWords(): readonly string[] {
  const lexical = readRepoFile(LEXICAL_PAGE).split("\n");
  const sentence = lexical.find((l) => l.startsWith("**Reserved keywords.**"));
  if (sentence === undefined) {
    throw new Error(
      `${LEXICAL_PAGE} no longer carries a line starting '**Reserved keywords.**' — the reserved-list oracle for bug 0219's class has no source`,
    );
  }
  const listPart = sentence.split("Using one of these")[0] as string;
  return [...listPart.matchAll(/`([A-Za-z_]+)`/g)].map((m) => m[1] as string);
}
```

tests/reserved-keyword-type-position.test.ts:149-172
```ts
function specReservedKeywords(): string[] {
  const page = readFileSync(
    fileURLToPath(new URL("../docs/spec_topics/lexical.md", import.meta.url)),
    "utf8",
  );
  const open = "**Reserved keywords.** Cannot be used as identifiers: ";
  const start = page.indexOf(open);
  if (start < 0) {
    throw new Error(
      `docs/spec_topics/lexical.md carries no \`${open}\` sentence, so the reserved set has no ` +
        "normative source to check the matrix against",
    );
  }
  const close = ". Using one of these in identifier position is";
  const end = page.indexOf(close, start);
  if (end < 0) {
    throw new Error(
      "docs/spec_topics/lexical.md §Reserved keywords no longer ends its list with " +
        `\`${close}\`, so the list's extent cannot be determined`,
    );
  }
  return [...page.slice(start + open.length, end).matchAll(/`([^`]+)`/g)].map(
    (match) => match[1] as string,
  );
}
```

Both functions: read `docs/spec_topics/lexical.md`, locate the same "**Reserved keywords.**" sentence, throw naming the missing anchor when it disappears, and regex-extract the backtick-quoted spellings between the sentence start and the "Using one of these …" clause. They differ only in file-reading mechanism (`readRepoFile(...).split("\n")` plus `.find` versus `readFileSync` plus `indexOf`) and in exactly which substring boundary marks the end of the list — cosmetic variation on one extraction task.

## Why this is a problem
Both files exist to prove the same class of claim — that their respective test matrices exhaustively cover every spelling `lexical.md`'s reserved-keyword sentence currently lists — and each pins that guarantee with its own hand-written re-derivation of the same sentence-parsing logic instead of one shared read. `grep -rn "Reserved keywords" tests/helpers/*.ts` (run before filing) shows no existing helper carries this extraction, so today it exists twice, independently, inside test bodies rather than once in a shared location.

## Suggested direction (non-binding, optional)
A single `specReservedKeywords()`-shaped export under tests/helpers/ would give both files (and any future reserved-keyword-class test) the same oracle without each hand-rolling its own sentence-boundary parsing.

## False-positive check
Gate-pin carve-out: neither file matches `*gate*.test.ts`, so the pinned-count carve-out does not apply to the duplicated extractor (the RFC-0010 spec-surface-gate file in this same scope was checked separately and is a genuine gate; this finding does not touch it). Recording-double carve-out: not applicable, no double or negative witness involved. docs/bugs/ signature search: the duplication is not a red test, so "documented correct-reason red" does not apply. coverage-matrix/bug-doc citation search: `grep -rn "specReservedWords\|specReservedKeywords" docs/` found no citations by name in docs/reference/coverage-matrix.md or any bug doc's witness list, so neither function is pinned by an external citation; this finding does not propose renaming or deleting a cited test. This is a coverage-neutral observation about duplicated harness code already present in both files, not a claim that either file's coverage is deficient.

## Triage
verdict: confirmed — independently re-verified: `specReservedWords` (object-pattern-head-refusal:214-223) and `specReservedKeywords` (type-position:149-172) reproduce verbatim at the cited lines, both are live (one call each at :362 and :695), and a node re-run of both extraction bodies against docs/spec_topics/lexical.md:20 yields the same 32-element list in the same order, so the differing boundary/regex mechanics are behaviour-neutral; `grep -rn "Reserved keywords" tests/helpers/` → 0 hits (no shared helper exists) and the two names occur nowhere else in tests/, src/, tools/, extensions/ or docs/ (coverage-matrix cites neither file); the two files landed in separate commits (61806a3a 2026-08-02 and 4d934a52 2026-08-21), so this is copy-forward boilerplate duplication, the D7 class; neither file is a gate, recording double or documented red; not a duplicate — the only prior filing touching this function (qw20260917154546-d7-03, false-positive) argued it should be replaced by the lexer's `reservedKeywords()` export, a different root cause, and that ruling upheld the spec-read oracle design, which a shared tests/helpers export preserves (triage: claude-fable-5-1)
