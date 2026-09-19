---
id: PTQ-0835
title: schema-body-unclosed-at-eof.test.ts's local msg() re-derives tests/helpers/load-row-harness.ts's exported registryMessageOf
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/schema-body-unclosed-at-eof.test.ts:158-177
  - tests/helpers/load-row-harness.ts:62-82
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# schema-body-unclosed-at-eof.test.ts's local msg() re-derives tests/helpers/load-row-harness.ts's exported registryMessageOf

## Observation
`tests/schema-body-unclosed-at-eof.test.ts` declares a local module-scope
`msg(code, fills)` function that looks up a registry row's *Message*
template through `registryMessage`, asserts the template is defined, then
substitutes each named placeholder while asserting its presence first.
`tests/helpers/load-row-harness.ts` already exports `registryMessageOf` doing
the same lookup-assert-substitute sequence over the same `registryMessage`
call, parameterised by the registry array and its source path. The reviewed
file's own sibling in this review's scope,
`tests/schema-field-discard-prefix-retention.test.ts`, already imports
`registryMessageOf` from this exact helper and wraps it in a two-line local
`msg`, rather than re-deriving the body.

## Evidence

`tests/schema-body-unclosed-at-eof.test.ts:158-177` (re-read immediately
before filing):
```ts
function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${code}`,
  ).toBeDefined();
  expect(
    typeof template === "string" && template.length > 0,
    `DIAG-4: the ${code} Message column must be a non-empty string; got ${JSON.stringify(template)}`,
  ).toBe(true);
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

`tests/helpers/load-row-harness.ts:62-82` — the canonical, already-exported
equivalent (identical lookup, identical definedness assertion wording down to
the `DIAG-4 anchor:` prefix, identical per-placeholder assert-then-substitute
loop):
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

The reviewed file's own in-scope sibling already uses the helper —
`tests/schema-field-discard-prefix-retention.test.ts:1` imports
`registryMessageOf` from `./helpers/load-row-harness`, and its own local
`msg` (line 129-131) is a two-line wrapper: `return registryMessageOf(REGISTRY,
"docs/spec_topics/diagnostics/code-registry-parse.md", code, fills);`.

Search: `grep -n "helpers/load-row-harness" tests/schema-body-unclosed-at-eof.test.ts`
→ 0 hits; the file imports only `readRegistry` from `./helpers/registry-oracle`
(line 1) and `registryMessage` directly from `../tools/code-registry/index.js`
(line 4), then hand-rolls the lookup-assert-substitute body itself instead of
calling `registryMessageOf` with that same `REGISTRY`.

## Why this is a problem
`tests/helpers/load-row-harness.ts`'s own header states it centralises the
"registry-message renderer" that several test files had independently
redeclared. The reviewed file's `msg` performs the identical sequence
(`registryMessage` lookup → `toBeDefined()` assertion on the template →
per-placeholder `toContain` assertion → `replace`) with the same assertion
message prefix (`DIAG-4 anchor:` / `DIAG-4:`) as the exported
`registryMessageOf`, adding only one extra non-empty-string assertion the
helper does not carry. A change to the substitution loop, the assertion
wording, or the failure-message shape must be applied by hand in this file as
well as in the helper (and in every other file that already imports the
helper) to stay in sync.

## Suggested direction (non-binding, optional)
`tests/helpers/load-row-harness.ts` already exports `registryMessageOf`,
which the reviewed file's own in-scope sibling
(`tests/schema-field-discard-prefix-retention.test.ts`) already calls as a
one-line wrapper around `REGISTRY` and the page path; the reviewed file's
`msg` could call the same export instead of re-deriving the lookup body.

## False-positive check
- Gate-pin check: `tests/schema-body-unclosed-at-eof.test.ts` does not match
  `*gate*.test.ts` or the named gate kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); the cited lines are a message-template
  renderer, not a pinned count or inventory assertion.
- Recording-double check: `msg`/`registryMessageOf` are pure lookups over a
  static parsed registry array; neither records calls nor backs a "never
  called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "registryMessageOf\|load-row-harness"
  docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md` → 0 hits; the bug
  document's own header (reproduced at the top of the reviewed file) is about
  the MISSING `theta/parse/schema-body-unclosed` registry row (a DIAG-2
  addition, still red at HEAD pending implementation), not about how the
  *Message* is read out of the registry once present, so no documented
  correct-reason red bears on this claim.
- coverage-matrix/bug-doc citation search: `grep -n
  "schema-body-unclosed-at-eof" docs/reference/coverage-matrix.md
  docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md` — the bug
  document names the file as its own witness by group/cell id (R, a, b, …),
  never by the `msg` function's line range; this finding proposes no change
  to any `it()`/`describe()` name, count, or assertion — only to where the
  message-lookup body is defined.
- Coverage check: the claim is about a repeated function DEFINITION, not a
  missing test path; every cell that calls the local `msg` continues to
  exercise the same registry read either way.
- Prior-filing overlap search: `grep -rl "registryMessageOf"
  quality/intake quality/issues quality/resolved` was run in full; no hit
  names `tests/schema-body-unclosed-at-eof.test.ts` in its own `locations`
  field (the hits target other files — e.g. generic-argument, inline-object,
  misfire-faces, params-default, quoted-stray, reservedmessage/
  unresolvedmessage, msg-row, msg-registered — none of which are this file).
  PTQ-0507 (resolved), the only prior finding against this file, is a
  distinct root cause (a redeclared `RegistryRow`/`REGISTRY` *reader*, fixed
  by importing `readRegistry` from `registry-oracle.ts`, which the file's
  current line 1 import confirms landed) and does not mention `msg` or
  `registryMessageOf` anywhere in its text.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/schema-body-unclosed-at-eof.test.ts:158-177 and tests/helpers/load-row-harness.ts:62-82; own diff of the `msg` body after substituting the closed-over `REGISTRY`→`registry` and the hard-coded page path→`${registryPath}` leaves only the signature line plus the one extra 4-line non-empty-string `toBe(true)` guard the filing discloses — lookup, `DIAG-4 anchor:` definedness assertion and the per-placeholder assert-then-replace loop are byte-identical, and `registryMessage` is a plain `find(...)?.message` so the swap is behaviour-neutral (keep the extra guard in the local wrapper if wanted); the file imports 0× from load-row-harness (rc=1) while 47 other tests import `registryMessageOf` and the named sibling schema-field-discard-prefix-retention.test.ts:1,129-130 is exactly the two-line wrapper claimed; `msg` is live (4 call sites); both locations under tests/, D7 boilerplate-duplication class, not a gate file, no recording double, docs/bugs/0245 → 0 hits for `registryMessageOf|load-row-harness`, coverage-matrix → 0 hits for the file, no it()/describe()/assertion change proposed; not a duplicate — resolved PTQ-0507 (the only prior PTQ on this file) contains 0 mentions of `msg`/`registryMessageOf` and migrated only the REGISTRY reader, open PTQ-0777/0786 target tests/live/live-production-acceptance.test.ts only, and the two other same-wave intakes naming this file (enum-body-unclosed registry-oracle, fnOf/paramsOf) cite disjoint helpers; per-file filings of this class on disjoint files are the accepted grain (PTQ-0495/0539/0567/0616/0747; same-wave generic-argument/quoted-stray/type-source/msg-row/reservedmessage/misfire-faces siblings all confirmed) (triage: claude-fable-5-1)
