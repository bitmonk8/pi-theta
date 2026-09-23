---
id: PTQ-1393
title: tools-entry-message-line-break reimplements the registry read and expectedMessage builder tests/helpers/registry-oracle.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/tools-entry-message-line-break.test.ts:85-111
  - tests/helpers/registry-oracle.ts:31-42
  - tests/helpers/registry-oracle.ts:169-179
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# tools-entry-message-line-break reimplements the registry read and expectedMessage builder tests/helpers/registry-oracle.ts already exports

## Observation
`tests/tools-entry-message-line-break.test.ts` builds its own module-level
`REGISTRY` by reading and parsing
`docs/spec_topics/diagnostics/code-registry-load.md` directly through
`readFileSync`/`fileURLToPath`/`parseRegistry`, and declares its own local
`expectedMessage(code, subs)` function that looks up a code's Message
template via `registryMessage`, asserts it is defined, and fills its `<…>`
placeholders with a `replaceAll` loop. `tests/helpers/registry-oracle.ts`
already exports `readRegistry(shards)` — which reads and joins exactly the
same sharded registry pages via the same `parseRegistry` call — and exports
an `expectedMessage(registry, code, subs)` doing the identical
lookup-and-fill shape. Neither is imported by the in-scope file; the sibling
in-scope files (`tools-field-shape-refusal.test.ts`,
`tools-field-zero-entry-scalar-refusal.test.ts`) do import
`readRegistry`/`loadRowMessage` from this same helper.

## Evidence
`tests/tools-entry-message-line-break.test.ts:85-111`:
```ts
/** The live sharded load registry — the *Message* column DIAG-4 makes normative. */
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../docs/spec_topics/diagnostics/code-registry-load.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * Source a code's registered *Message* template and fill its `<…>`
 * placeholders. DIAG-4 makes the template normative, so no expected string in
 * this file is copy-pasted prose: the fix changes what `<value>` interpolates
 * and nothing else.
 */
function expectedMessage(
  code: string,
  subs: Readonly<Record<string, string>>,
): string {
  let message = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    message,
    `${code} has no row in docs/spec_topics/diagnostics/code-registry-load.md,` +
      " so DIAG-4 has no normative string for this witness to source",
  ).toBeDefined();
  let filled = message as string;
  for (const [placeholder, value] of Object.entries(subs)) {
    filled = filled.replaceAll(placeholder, value);
  }
  return filled;
}
```

`tests/helpers/registry-oracle.ts:31-42` — the canonical shard reader this
duplicates (only the single `"load"` shard is needed here, which
`readRegistry(["load"])` already supports):
```ts
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

`tests/helpers/registry-oracle.ts:169-179` — the canonical lookup-and-fill
function this duplicates:
```ts
export function expectedMessage(
  registry: readonly Pick<RegistryRow, "code" | "message">[],
  code: string,
  subs: Readonly<Record<string, string>>,
): string {
  let message = registryMessage(registry, code) as string;
  for (const [placeholder, value] of Object.entries(subs)) {
    // `replaceAll` — the rename template repeats `<name>`.
    message = message.replaceAll(placeholder, value);
  }
  return message;
}
```

## Why this is a problem
The registry-shard read (`readFileSync` + `parseRegistry` over
`code-registry-<shard>.md`) and the code-lookup-then-fill-placeholders shape
are each declared a second time inside this file, when a module built and
exported specifically for this purpose (`tests/helpers/registry-oracle.ts`,
whose header states it centralises "the shared four-page diagnostics-registry
read ... redeclared byte-for-byte ... in several test files") already
provides both under the names `readRegistry` and `expectedMessage`. A change
to how the registry pages are located or joined, or to the placeholder-fill
loop's semantics (e.g. the multi-value `replaceAll` note in the helper's own
comment), needs a matching edit in this file that would not be needed if it
called the shared functions.

## Suggested direction (non-binding, optional)
`readRegistry(["load"])` and the exported `expectedMessage(registry, code,
subs)` are the direct drop-in replacements for this file's local `REGISTRY`
constant and local `expectedMessage` function; naming that existing helper
module is an observation about a home already built for this shape, not a
design this filing owns.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named
  gate-kin patterns; not applicable.
- Recording-double check: `REGISTRY`/`expectedMessage` read a static markdown
  registry page, not a call-recording double used for a MUST-NOT witness; not
  applicable.
- docs/bugs/ signature search: `grep -n "Status:" docs/bugs/0105-*.md` —
  `Status: fixed`; the reds this file documents are the line-break/rendering
  behaviour (groups M/F/S/T), not this registry-read scaffolding, so this is
  not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -rn
  "tools-entry-message-line-break" docs/reference/coverage-matrix.md
  docs/bugs/` — the file is named in its own bug doc (0105) as that bug's
  witness, but no citation pins the `REGISTRY`/`expectedMessage` declaration
  or a line range inside it; this finding proposes no merge, rename, or
  deletion of the test.
- This is a duplication claim about existing harness code in one in-scope
  file against an existing exported helper; no assertion is made about a
  missing test or an untested path.

## Triage
<!-- triage appends here -->
verdict: confirmed — excerpts reproduce at tests/tools-entry-message-line-break.test.ts:85-111 (module-level REGISTRY via readFileSync/fileURLToPath/parseRegistry over code-registry-load.md, plus a local expectedMessage lookup-and-replaceAll loop) and tests/helpers/registry-oracle.ts:31-42 / 169-179 export readRegistry(shards) and expectedMessage(registry, code, subs) with the identical shape; the file imports parseRegistry/registryMessage directly and nothing from registry-oracle, while both in-scope siblings (tools-field-shape-refusal:2,180; tools-field-zero-entry-scalar-refusal:2,140) already import readRegistry/loadRowMessage; bug 0105 is Status: fixed, no gate/recording-double/coverage-matrix carve-out applies, and no existing PTQ names this file's REGISTRY/expectedMessage (PTQ-0722 covered its production-load harness, a different root cause); the local copy's only delta is an absent-row toBeDefined guard, which the same helper's loadRowMessage/registryMessageOf already provide, so a migration keeps the fail-loud posture (triage: claude-fable-5-1)
