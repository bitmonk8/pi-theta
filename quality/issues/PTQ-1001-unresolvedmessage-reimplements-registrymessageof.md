---
id: PTQ-1001
title: inline-object-nested-lowering.test.ts's unresolvedMessage/unresolvedLine reimplement the canonical registryMessageOf reader
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inline-object-nested-lowering.test.ts:207-230
  - tests/helpers/load-row-harness.ts:62-76
sites: 1
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# inline-object-nested-lowering.test.ts's unresolvedMessage/unresolvedLine reimplement the canonical registryMessageOf reader

## Observation
`tests/inline-object-nested-lowering.test.ts` declares a module-level
`unresolvedMessage(name: string): string` that reads the
`theta/parse/unresolved-named-type` row's *Message* template via
`registryMessage(REGISTRY, CODE)`, asserts its definedness with the fixed
string `` `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${CODE}` ``,
then fills the single `<name>` placeholder with `.replace`, plus a second
`unresolvedLine(name)` that prefixes the rendered message with the severity
and code. `tests/helpers/load-row-harness.ts` already exports
`registryMessageOf(registry, registryPath, code, fills)`, which performs the
identical read → `expect(...).toBeDefined()` with the same "DIAG-4 anchor"
wording → placeholder-fill sequence, generalised over an arbitrary
placeholder/fills list rather than the one hard-coded `<name>` slot.

## Evidence

`tests/inline-object-nested-lowering.test.ts:207-230` (re-read immediately
before filing):
```ts
const CODE = "theta/parse/unresolved-named-type";

/**
 * The registry row's normative *Message* template with its single `<name>`
 * placeholder filled. Definedness is asserted first so a missing row reds by
 * naming the registry rather than by a bare `undefined` comparison.
 */
function unresolvedMessage(name: string): string {
  const template = registryMessage(REGISTRY, CODE) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${CODE}`,
  ).toBeDefined();
  return (template as string).replace("<name>", name);
}

/**
 * The one rendered diagnostic line every position of the row must produce for
 * the nested typo. The `error` prefix is the row's severity column: an
 * error-severity parse diagnostic is what refuses the theta.
 */
function unresolvedLine(name: string): string {
  return `error ${CODE}: ${unresolvedMessage(name)}`;
}
```

`tests/helpers/load-row-harness.ts:62-76` (re-read immediately before
filing) — the canonical export performing the same sequence, parameterised:
```ts
export function registryMessageOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): string {
  const template = registryMessage(registry, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${registryPath} must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}
```

Calling `registryMessageOf(REGISTRY, "docs/spec_topics/diagnostics/code-registry-parse.md", CODE, [["<name>", name]])`
produces the same string `unresolvedMessage(name)` returns today: same
registry read, same "DIAG-4 anchor … Message row for …" assertion wording
(module-specific literal replaced by the parameterised `registryPath`/`code`),
same placeholder substitution.

## Why this is a problem
The function is pure harness plumbing — turning a registry-row lookup into a
loud, named failure and filling one placeholder — not domain logic specific to
bug 0039's subject. An identical read-assert-fill sequence, generalised to an
arbitrary placeholder/fills list, is already exported from
`tests/helpers/load-row-harness.ts` for exactly this use, so a future change to
the assertion's wording, its `toBeDefined()`/`toContain()` shape, or the
placeholder-fill order would need a matching hand-edit here that the export
does not enforce.

## Suggested direction (non-binding, optional)
Calling the existing `registryMessageOf` export with the
`code-registry-parse.md` path and a one-entry fills list in place of the local
`unresolvedMessage` body would remove the local read-assert-fill copy while
keeping `unresolvedLine`'s severity-prefix wrapper local to this file.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named gate
  kin; the cited lines are a registry-message reader, not a pinned count or
  inventory.
- Recording-double check: `unresolvedMessage` performs a synchronous registry
  lookup and string fill; it records no calls and backs no "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "unresolvedMessage\|registryMessageOf"
  docs/bugs/0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md`
  returns 0 hits stating a rationale for keeping a local copy rather than
  calling the existing export.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-object-nested-lowering" docs/reference/coverage-matrix.md` returns
  0 hits. docs/bugs/0039 cites this file by name and by group/cell id, never
  by `unresolvedMessage`'s internal implementation; this finding proposes no
  change to any `it()`/`describe()` name, count, or assertion — only to where
  the read-assert-fill sequence is defined.
- Coverage check: the claim is about a repeated function DEFINITION with an
  already-exported canonical counterpart, not a missing test path; the local
  copy is exercised by every `unresolvedLine(...)`/`unresolvedMessage(...)`
  call in the file (group (d) and the module-scope `EXPECTED` constant).
- Prior-filing overlap check: `grep -rl "unresolvedMessage\|unresolvedLine"
  quality/issues/*.md quality/intake/*.md quality/resolved/*.md` returns
  PTQ-0734 (a different function, the four-page `REGISTRY` re-read, disjoint
  root cause) and PTQ-0832 (`reservedMessage`/`unresolvedMessage` in
  `tests/inline-slug-name-reservation.test.ts`, three copies inside ONE
  different file — not `tests/inline-object-nested-lowering.test.ts`, whose
  own copy is not named in PTQ-0832's locations or evidence). No open,
  resolved, or pending finding cites
  `tests/inline-object-nested-lowering.test.ts`'s `unresolvedMessage`/
  `unresolvedLine` pair. This finding is scoped to this one file's copy, not
  to the wider 21-file family the exact search `grep -rln "function
  unresolvedMessage\|function unresolvedLine" tests/*.ts` turns up (cited for
  completeness, not claimed as one root cause: each of those 21 sites reads a
  different registry code and a different placeholder set, so folding them
  into a single finding would mix unrelated fixture subjects).

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/inline-object-nested-lowering.test.ts:207-230 and tests/helpers/load-row-harness.ts:62-76; the local `unresolvedMessage` is the same registryMessage→`DIAG-4 anchor: <page> must carry the Message row for <code>`→`.replace` sequence as `registryMessageOf` with the page path hard-coded to the harness's own `PARSE_REGISTRY_PATH` literal, and `unresolvedLine` is likewise `registryLineOf`'s `error ${code}: …` wrapper; registry-oracle's 6-field `RegistryRow` is a structural superset of the harness's `{code,message}` so the imported `REGISTRY` passes through, and the row's Message is `unresolved named type '<name>'` (code-registry-parse.md) so the harness's extra `toContain("<name>")` check holds — the fold is mechanical and strictly stronger; both copies live (`EXPECTED` :1045, group (d) :1963), file green 61/61; all locations under tests/, D7 boilerplate-duplication class, not a gate file, no recording-double or documented-red carve-out; stated searches reproduce (docs/bugs/0039 identifier grep → 0, coverage-matrix file cite → 0, 21-file `function unresolvedMessage` family → 21, which this repo rules per file: PTQ-0808/0819/0827/0834/0835/0840/0859/0939 etc.); dedupe clean — resolved PTQ-0412 covered this file's four-page `REGISTRY` join and explicitly left `unresolvedMessage`/`unresolvedLine` untouched, PTQ-0832 covers inline-slug-name-reservation.test.ts's copies, PTQ-0734 covers three other files, and the eight other PTQs naming this file (0574/0653/0691/0793/0794/0867/0879/0884) cite different helpers (triage: claude-fable-5-1)
