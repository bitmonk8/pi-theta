---
id: PTQ-0751
title: The fixture-builder and diagnostic-assertion harness is duplicated verbatim between the two inline-object test files
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/inline-empty-object-type.test.ts:221-266
  - tests/inline-empty-object-type.test.ts:282-284
  - tests/inline-object-duplicate-field-name.test.ts:301-353
sites: 2
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# The fixture-builder and diagnostic-assertion harness is duplicated verbatim between the two inline-object test files

## Observation
Both files in scope declare the same seven helpers in the same order, with the same doc comments, to build `.theta` fixtures and assert on parse diagnostics: `FM`/`TAIL` fixture constants, `body()`, `paramsSrc()`, `annotSrc()`, `invokeSrc()`, `diagLines()`, `lines()`, `expectList()`, and `emptyCtx()`. Every one of these nine declarations is byte-identical between the two files except for the default `path` string literal passed to `lines()` (`"bug0045.theta"` vs `"bug0052.theta"`) and one added `DUP` constant and one added `ajv()`/`errorCodes()` pair in the second file. No `tests/helpers/` module currently exports this fixture/assertion set.

## Evidence

`tests/inline-empty-object-type.test.ts:221-266`:
```typescript
const FM = "---\nmode: prompt\n---\n";
const TAIL = "let a = 1\na\n";

/** A `mode: prompt` theta whose body is `stmt` followed by the tail. */
function body(stmt: string): string {
  return `${FM}${stmt}\n${TAIL}`;
}

/** A `mode: prompt` theta whose `params:` block is `block`. */
function paramsSrc(block: string): string {
  return `---\nmode: prompt\nparams:\n${block}\n---\n${TAIL}`;
}

/** The `@<T>` query annotation — a type-ascription context (grammar.md:105). */
function annotSrc(type: string): string {
  return body("let r = @<" + type + ">`hi`");
}

/** The `invoke<T>` return annotation, the one position running no walk at HEAD. */
function invokeSrc(type: string): string {
  return body(`let r = invoke<${type}>("./x.theta")`);
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string, path = "bug0045.theta"): string[] {
  return diagLines(parseDoc(src, path));
}

function expectList(src: string, expected: readonly string[], why: string): void {
  expect(lines(src), `${why}\nsource=${JSON.stringify(src)}`).toEqual([...expected]);
}
```

`tests/inline-empty-object-type.test.ts:282-284`:
```typescript
function emptyCtx(): LowerCtx {
  return { bodyTypeMap: new Map<string, Record<string, unknown>>(), defs: {}, unresolved: [] };
}
```

`tests/inline-object-duplicate-field-name.test.ts:301-353` (identical to the block above, `DUP` inserted between `TAIL` and `body()`, only the `lines()` default path string differs, `emptyCtx()` inlined at the end of the same block instead of split out):
```typescript
const FM = "---\nmode: prompt\n---\n";
const TAIL = "let a = 1\na\n";

/** The subject of this report: two fields of one inline body sharing a name. */
const DUP = "{a: integer, a: string}";

/** A `mode: prompt` theta whose body is `stmt` followed by the tail. */
function body(stmt: string): string {
  return `${FM}${stmt}\n${TAIL}`;
}

/** A `mode: prompt` theta whose `params:` block is `block`. */
function paramsSrc(block: string): string {
  return `---\nmode: prompt\nparams:\n${block}\n---\n${TAIL}`;
}

/** The `@<T>` query annotation — a type-ascription context (grammar.md:105). */
function annotSrc(type: string): string {
  return body("let r = @<" + type + ">`hi`");
}

/** The `invoke<T>` return annotation. */
function invokeSrc(type: string): string {
  return body(`let r = invoke<${type}>("./x.theta")`);
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string, path = "bug0052.theta"): string[] {
  return diagLines(parseDoc(src, path));
}

function expectList(src: string, expected: readonly string[], why: string): void {
  expect(lines(src), `${why}\nsource=${JSON.stringify(src)}`).toEqual([...expected]);
}

/** A `LowerCtx` over an EMPTY resolution set — no declaration resolves anything. */
function emptyCtx(): LowerCtx {
  return { bodyTypeMap: new Map<string, Record<string, unknown>>(), defs: {}, unresolved: [] };
}
```

Repetitions: 2 (every file in this review's scope), each instance cited above by path:line-range; `grep -n "^function body(stmt: string)"` over the two files confirms exactly one declaration per file, both with the identical one-line body `return \`${FM}${stmt}\n${TAIL}\`;`.

## Why this is a problem
Nine helpers — three fixture constants/builders (`FM`, `TAIL`, `body`), three position-specific fixture builders (`paramsSrc`, `annotSrc`, `invokeSrc`), and three assertion helpers (`diagLines`, `lines`, `expectList`) plus `emptyCtx` — are declared with identical names, identical bodies, and (for all but one string literal) identical doc comments in both files under review. Both files also carry the same explicit self-description of their own harness ("Fixtures. One builder per position of grammar.md's enumeration…", "Parse + assertion helpers. Loud on every unexpected disposition.") word-for-word, which is the harness announcing its own shared identity while remaining declared twice. Neither file imports the other's declarations or a shared module; each is a standalone top-to-bottom copy.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting this shared `.theta`-fixture-and-diagnostic-list harness (`FM`/`TAIL`/`body`/`paramsSrc`/`annotSrc`/`invokeSrc`/`diagLines`/`lines`/`expectList`/`emptyCtx`), parameterised by the default fixture path where the two files diverge, would be the natural home these two byte-identical copies point at — a repository-wide search for the same nine names was not run and is left as a routing note rather than an inventory claim.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin patterns; not applicable.
- Recording-double check: none of the nine helpers records calls for a MUST-NOT witness; `diagLines`/`lines`/`expectList` render and compare a real parser's diagnostic output, not a double's call log; not applicable.
- docs/bugs/ signature search: `grep -rn "inline-empty-object-type.test.ts\|inline-object-duplicate-field-name.test.ts" docs/bugs/` returns citations to specific test cells (`a7`, `e5`, `g3`, `d4`, `d5`, `k2`, `l1`, `i1`, …) by absolute line range; none of the cited ranges fall inside the harness blocks under evidence here (221-266/282-284 and 301-353), so no cited witness line is disturbed by this observation.
- coverage-matrix/bug-doc citation search: both files are pinned by name in multiple bug docs' witness lists (0045, 0052, 0093, 0159-0161, 0176, 0228, 0233, 0245, 0262-0263); this finding does not propose merging, renaming, or deleting either test file, only observes that their fixture/assertion harness is a byte-identical pair — any future consolidation would need to account for the absolute-line-number citations these bug docs already carry (as bug 0421's own line-shift correction did for this same pair of files).
- Coverage drift: this finding does not claim any behaviour is untested; both files' harness code backs assertions that already exist and run.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: all three excerpts match at the cited lines; sed-extracted blocks diff shows every function/const body byte-identical (FM/TAIL/body/paramsSrc/annotSrc/invokeSrc/diagLines/lines/expectList/emptyCtx) with only the `lines()` default path, the `invokeSrc` doc-comment tail and the expectList "group (g)/(c)" doc letter differing (a minor over-claim on "identical doc comments" that does not touch the root cause); repo-wide grep undercounts rather than refutes — `^function paramsSrc(` in 12 tests/*.test.ts, `^function annotSrc(` in 9, `^function emptyCtx(): LowerCtx` and the FM/TAIL pair in 3 (+reserved-keyword-type-position); no tests/helpers export for lines/expectList/emptyCtx/annotSrc/invokeSrc/paramsSrc/FM/TAIL, both files already import parseDoc from e2e-s1; one accounting correction: `diagLines` IS now exported at tests/helpers/e2e-s1.ts:100 by PTQ-0205's fix, which cited these two files by line (249/332) yet 51 test files including both still redeclare it — that piece is a PTQ-0205 residual folded into this broader harness, not a separate root cause; neither file is a gate, coverage-matrix 0 hits, no docs/bugs line pin falls inside 221-266/282-284/301-353, both suites 95/95 green; same-wave sibling d7-70 (FM/TAIL/body triad over the let-annotation pair) overlaps on three declarations but names disjoint files and a narrower set — the fixer should route both to one shared home; same D7 copy-paste-fixture class as PTQ-0205/0227 (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
