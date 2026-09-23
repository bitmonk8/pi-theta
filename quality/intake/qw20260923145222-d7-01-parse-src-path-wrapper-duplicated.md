---
id: pending
title: par-for-body-return-refusal.test.ts redeclares a byte-identical parseDoc pass-through wrapper already shared with five other files
lens: D7
status: intake
verdict: pending
locations:
  - tests/par-for-body-return-refusal.test.ts:92-94
  - tests/subagent-fn.test.ts:166-168
  - tests/blockexpr-production.test.ts:95-97
  - tests/par-body-restriction-registry-rows.test.ts:284-286
  - tests/query-schema-resolve.test.ts:32-34
  - tests/wire-translation-inbound-retag.test.ts:36-38
  - tests/helpers/e2e-s1.ts:98
sites: 6
fix_scope: module
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# par-for-body-return-refusal.test.ts redeclares a byte-identical parseDoc pass-through wrapper already shared with five other files

## Observation
`tests/par-for-body-return-refusal.test.ts:92-94` declares a local `parse` function whose body is exactly `return parseDoc(src, path);`, over a signature `(src: string, path = "test.theta"): ThetaDocument`. `tests/helpers/e2e-s1.ts:98` already exports `parseDoc(src, path = "test.theta")` with the identical default. Five other test files declare the same one-line pass-through wrapper, varying only the default `path` string literal, all importing `parseDoc` from the same helper module and never using the wrapper for anything `parseDoc` does not already do on its own.

## Evidence
tests/par-for-body-return-refusal.test.ts:92-94 (this file, in scope):
```ts
function parse(src: string, path = "test.theta"): ThetaDocument {
  return parseDoc(src, path);
}
```

tests/helpers/e2e-s1.ts:98 — the wrapped function already carries the same default:
```ts
export function parseDoc(src: string, path = "test.theta"): ThetaDocument {
```

tests/subagent-fn.test.ts:166-168 — byte-identical wrapper, same default:
```ts
function parse(src: string, path = "test.theta"): ThetaDocument {
  return parseDoc(src, path);
}
```

tests/blockexpr-production.test.ts:95-97 — identical body, default swapped to `"bug0082.theta"`:
```ts
function parse(src: string, path = "bug0082.theta"): ThetaDocument {
  return parseDoc(src, path);
}
```

tests/par-body-restriction-registry-rows.test.ts:284-286 — identical body, default swapped to `"bug0200.theta"`:
```ts
function parse(src: string, path = "bug0200.theta"): ThetaDocument {
  return parseDoc(src, path);
}
```

tests/query-schema-resolve.test.ts:32-34 — identical body, default swapped to `"resolve.theta"`:
```ts
function parse(src: string, path = "resolve.theta"): ThetaDocument {
  return parseDoc(src, path);
}
```

tests/wire-translation-inbound-retag.test.ts:36-38 — identical body, default swapped to `"retag.theta"`:
```ts
function parse(src: string, path = "retag.theta"): ThetaDocument {
  return parseDoc(src, path);
}
```

Each of the six files imports `parseDoc` directly from `tests/helpers/e2e-s1.ts` (confirmed at par-for-body-return-refusal.test.ts:3, subagent-fn.test.ts:7, blockexpr-production.test.ts:24, par-body-restriction-registry-rows.test.ts:1, query-schema-resolve.test.ts:1, wire-translation-inbound-retag.test.ts:1), so the wrapper is not bridging an absent import — it renames an already-available call with an optionally different default argument.

Exact search used: `grep -rl "^function parse(src" tests/*.test.ts` returns 27 hits; of those, the six cited above have a wrapper body of exactly one statement, `return parseDoc(src, path);`, differing only in the literal default supplied for `path`. The remaining 21 hits (e.g. `array-ternary-common-type-union.test.ts`, `b0324-max-incompatible-static.test.ts`, `typed-query-provider-gate.test.ts`) add frontmatter concatenation, diagnostic filtering, or call a different underlying parser and are excluded from this count as a different shape.

## Why this is a problem
Six test files carry the identical single-statement forwarding function, differing only in a default-argument literal that `parseDoc` itself already supports via its own default parameter. The wrapper adds no behavior over calling `parseDoc` directly (with an explicit second argument where a file wants a non-default path), so its repetition across files is the setup boilerplate this lens's duplication class targets: the same trivial harness sequence, copied six times, when tests/helpers/e2e-s1.ts already is the natural shared home for the underlying call and needs no further export to remove the wrapper.

## Suggested direction (non-binding, optional)
Calling `parseDoc` directly at each call site (supplying the desired path literal where it differs from `parseDoc`'s own default) would remove the six duplicated forwarding declarations without changing any assertion.

## False-positive check
Gate-pin check: none of the six files match `*gate*.test.ts` or the named gate-kin patterns, so the census/pin carve-out does not apply. Recording-double check: `parse` is a plain forwarding function, not a call-recording double, so the negative-witness carve-out does not apply. docs/bugs/ signature search: `grep -rn "parse(src" docs/bugs/` returned no hits tying this wrapper's shape to a documented correct-reason red. Coverage-matrix/bug-doc citation search: `grep -rn "function parse(src" docs/reference/coverage-matrix.md docs/bugs/*.md` returned no hits, so none of the six wrapper declarations are cited by name in a pinning document. This finding does not propose deleting or renaming any test, only the six local forwarding functions, so no merge/rename-of-cited-test disclosure is owed. The claim is limited to the wrapper declarations existing and being byte-identical in body; it does not assert any test is missing or under-covered.

## Triage
verdict: questionable — facts reproduce (all six `function parse(src, path = …) { return parseDoc(src, path); }` excerpts match at the cited lines, every file imports parseDoc from ./helpers/e2e-s1, e2e-s1.ts:98 carries the same "test.theta" default, the `^function parse(src` search returns 27 hits, no gate/recording-double/bug-doc/coverage-matrix carve-out applies, and no open PTQ tracks the residual — the resolved PTQ-0455/0648/0676/0706 fixes are what PRODUCED four of these aliases by migrating makeDeps/parse onto parseDeps/parseDoc while keeping the local name), but the anchor is taste-thin: each copy is a 3-line same-module alias with a per-file default path, not a reimplementation, and the suggested direction touches ~66 call sites (5/20/12/2/13/14) of which ~41 in the four non-default files would need the path literal spelled at every call; whether thin per-file forwarding aliases over an imported canonical helper count as D7 boilerplate worth removing (REVIEW_LOG.md:311/:719 left the same shape unfiled as "already a thin wrapper over a canonical helper") needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — facts reproduce (all six 3-line `parse(src, path = …) { return parseDoc(src, path); }` wrappers match at the cited lines, each file imports parseDoc from ./helpers/e2e-s1, parseDoc's matching "test.theta" default is at e2e-s1.ts:105 rather than :98, and `^function parse(src` gets 27 hits of which exactly 6 have this body; no gate, recording-double or bug-doc carve-out applies and no open PTQ covers it), but the anchor is thin: each copy is a same-file alias that holds a per-file default path (4 of 6 differ from parseDoc's own), not a reimplementation of logic, so removing them means writing the path literal out at roughly 41 of about 66 call sites; REVIEW_LOG.md:719 left thin wrappers over canonical helpers unfiled, so a human should decide whether these aliases count as D7 boilerplate (triage: claude-opus-5-5)
verdict: questionable — facts reproduce again: all six 3-line `parse(src, path = …) { return parseDoc(src, path); }` wrappers sit at the cited lines, each file imports parseDoc from ./helpers/e2e-s1, parseDoc's matching "test.theta" default has drifted to e2e-s1.ts:106, and `^function parse(src` still gets 27 hits; no gate, recording-double or bug-doc carve-out applies and no open PTQ tracks it; but each copy is a same-file alias that holds a per-file default path (4 of 6 differ from parseDoc's default), not reimplemented logic, so removing them means writing the path literal out at about 41 of 66 call sites (5/20/12/2/13/14); REVIEW_LOG.md:719 left thin wrappers over canonical helpers unfiled, so whether this counts as D7 boilerplate needs a human ruling (triage: claude-opus-5-5)
