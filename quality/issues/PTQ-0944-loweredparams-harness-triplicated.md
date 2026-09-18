---
id: PTQ-0944
title: loweredParams() parseParams-plus-fail-loudly harness is retyped in three proto-named-*.test.ts siblings
lens: D7
status: open
verdict: confirmed
locations:
  - tests/proto-named-schema-validator-enforcement.test.ts:146-169
  - tests/proto-named-binder-write-sites.test.ts:135-155
  - tests/proto-named-record-write-sites.test.ts:733-756
sites: 3
fix_scope: cross-module
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# loweredParams() parseParams-plus-fail-loudly harness is retyped in three proto-named-*.test.ts siblings

## Observation
`tests/proto-named-schema-validator-enforcement.test.ts` declares a
`loweredParams(fields, what)` helper that calls `parseParams`, filters its
diagnostics for `severity === "error"`, throws loudly naming
`code-registry-parse.md:19` if any error-severity diagnostic is present, and
throws loudly naming the missing precondition if `result.loweredSchema` is
`undefined`, otherwise returns `result.loweredSchema`. The sibling files
`tests/proto-named-binder-write-sites.test.ts` and
`tests/proto-named-record-write-sites.test.ts` (same bug-0214/bug-0212
lineage, different write sites) each declare the identical sequence —
same `parseParams` call shape (`fields.map((field, index) => ({ ...field,
range: range(index + 1) }))`, `[]`, a `{ file: ... }` options object), the
same error-filter, the same two fail-loudly throws referencing the same spec
anchor and the same fixed English framing ("must lower CLEAN … a diagnostic
here is a harness failure").

## Evidence

`tests/proto-named-schema-validator-enforcement.test.ts:146-169`:
```ts
function loweredParams(
  fields: readonly { readonly name: string; readonly typeSource: string }[],
  what: string,
): LoweredSchema {
  const result = parseParams(
    fields.map((field, index) => ({ ...field, range: range(index + 1) })),
    [],
    { file: "test.theta" },
  );
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `harness: ${what}'s \`params:\` block must lower CLEAN (code-registry-parse.md:19 admits a \`_\`-leading name), so a diagnostic here is a harness failure. Observed ${errors
        .map((d) => `${d.code}: ${d.message}`)
        .join("; ")}`,
    );
  }
  if (result.loweredSchema === undefined) {
    throw new Error(
      `harness: \`parseParams\` withheld the lowered schema for ${what} with no error-severity diagnostic — the cell has nothing to compile`,
    );
  }
  return result.loweredSchema;
}
```

`tests/proto-named-binder-write-sites.test.ts:135-155` — the same shape, one
word shorter in the error message and one word shorter in the withheld-schema
message:
```ts
function loweredParams(fields: readonly Field[], what: string): LoweredSchema {
  const result = parseParams(
    fields.map((field, index) => ({ ...field, range: range(index + 1) })),
    [],
    { file: "bug0214.theta" },
  );
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `harness: ${what}'s \`params:\` block must lower CLEAN; observed ${errors
        .map((d) => `${d.code}: ${d.message}`)
        .join("; ")}`,
    );
  }
  if (result.loweredSchema === undefined) {
    throw new Error(
      `harness: \`parseParams\` withheld the lowered schema for ${what} with no error-severity diagnostic — the cell has nothing to drive`,
    );
  }
  return result.loweredSchema;
}
```

`tests/proto-named-record-write-sites.test.ts:733-756` — the zero-parameter
specialisation of the same sequence, with the same "must lower CLEAN
(code-registry-parse.md:19 admits a `_`-leading name)" clause verbatim:
```ts
  function loweredParams(): Record<string, unknown> {
    const result = parseParams(
      [
        { name: "__proto__", typeSource: "integer", range: range(1) },
        { name: "a", typeSource: "string", range: range(2) },
      ],
      [],
      { file: "test.theta" },
    );
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      throw new Error(
        `harness: this \`params:\` block must lower CLEAN (code-registry-parse.md:19 admits a \`_\`-leading name), so a diagnostic here is a harness failure. Observed ${errors
          .map((d) => `${d.code}: ${d.message}`)
          .join("; ")}`,
      );
    }
    if (result.loweredSchema === undefined) {
      throw new Error(
        "harness: `parseParams` withheld the lowered schema with no error-severity diagnostic — cell (C2) has nothing to assert on",
      );
    }
    return result.loweredSchema as Record<string, unknown>;
  }
```

Exact search: `grep -n "function loweredParams" tests/proto-named-*.test.ts`
returns exactly these three declarations; no fourth `proto-named-*.test.ts`
file and no `tests/helpers/` module declares a function of this name.

## Why this is a problem
The same eleven/thirteen-line "call `parseParams`, filter for
error-severity, fail loudly naming `code-registry-parse.md:19` if any is
present, fail loudly naming the missing precondition if `loweredSchema` is
withheld, else return it" sequence is retyped three times across the
bug-0212/bug-0214 lineage's sibling files, with the differences confined to
the parameter list (generalised `fields`/`what` vs. a hard-coded pair) and
the wording of the two throw messages. `tests/helpers/proto-named-harness.ts`
already exists as the shared home for this lineage's `jsonSlug`, `hasOwn`,
`prototypeReport` and `range` primitives (two of the three files already
import all four from it), yet none of the three imports a shared
`loweredParams`, and each copy must be hand-edited identically if the
fail-loudly wording or the `parseParams` call shape ever changes.

## Suggested direction (non-binding, optional)
`tests/helpers/proto-named-harness.ts` already holds this lineage's other
shared primitives; a `loweredParams(fields, what)` export there, parameterised
exactly as the schema-validator-enforcement copy already is, is the natural
neighbour the other two copies would specialise from.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named gate kin; the cited lines are a fail-loudly setup helper, not a
  pinned count or inventory assertion.
- Recording-double check: `loweredParams` records nothing and backs no
  "never called" witness; it is a harness fixture-construction helper, not a
  recording double.
- docs/bugs/ signature search: `grep -rl "proto-named-schema-validator-enforcement\|proto-named-binder-write-sites\|proto-named-record-write-sites" docs/bugs/*.md` finds docs/bugs/0212 and docs/bugs/0214, both of which discuss the write-site defects these files witness, not this shared setup helper's duplication.
- coverage-matrix/bug-doc citation search: `grep -n "proto-named-schema-validator-enforcement\|proto-named-binder-write-sites\|proto-named-record-write-sites" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename or deletion of any `it()`/`describe()` block.
- Coverage check: the claim is about a duplicated helper DEFINITION; each copy already runs successfully (or reds for its own documented bug reason) inside its own file today.
- Prior-filing overlap check: `grep -rl "function loweredParams" quality/intake/*.md quality/issues/*.md quality/resolved/*.md` → 0 hits before this filing; the resolved PTQ-0730 covers `hasOwn`/`prototypeReport` in the same three files but does not mention `loweredParams`.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all three excerpts reproduce byte-for-byte at the cited lines (schema-validator-enforcement :146-169, binder-write-sites :135-155, record-write-sites :733-756), mktemp `diff` of the extracted bodies shows the differences confined exactly to the signature/hard-coded field pair, the `file:` option string (`test.theta` vs `bug0214.theta`) and the two throw-message wordings, with the parseParams→filter `severity === "error"`→throw→`loweredSchema === undefined`→throw→return sequence identical; every copy is live (5 / 4 / 2 call sites beyond the declaration); `grep -rn "function loweredParams" src/ extensions/ tools/ tests/` confirms these are the only three in `proto-named-*.test.ts` and the only three with this parseParams-driven shape (the other test-side `loweredParams` helpers read `frontmatter.params.loweredSchema` off a parsed document or return source text — a different shape, so `sites: 3` is accurate), no `tests/helpers/` module exports one (proto-named-harness.ts exports only jsonSlug/hasOwn/prototypeReport/range); git shows the same sequential copying PTQ-0730 recorded (cea6665f 2026-08-20 → e3470433 and 16ab2c58 2026-08-21); no gate/recording-double/red-test carve-out applies (a fail-loudly setup helper, not a skip or pin), coverage-matrix → 0 hits and the docs/bugs 0210/0212/0214 citations cover only the RED-pin cells; no open/resolved PTQ tracks it — PTQ-0730's direction paragraph names `loweredParams` only as an example neighbour, PTQ-0671 covers jsonSlug/hasOwn/range, PTQ-0878 is the envelope fragment builder — so this is a new D7 boilerplate-duplication root cause; note for the fixer that the binder copy's `Field` carries an optional `defaultSource` the spread preserves, so the shared export's parameter type must admit it (triage: claude-fable-5-1)
