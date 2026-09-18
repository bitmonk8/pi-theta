---
id: PTQ-0805
title: par-body-restriction-registry-rows.test.ts's fill() reproduces bug 0194's placeholder-interpolation harness almost line-for-line
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/par-body-restriction-registry-rows.test.ts:167-188
  - tests/loop-element-withhold-binding-scoped.test.ts:195-216
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# par-body-restriction-registry-rows.test.ts's fill() reproduces bug 0194's placeholder-interpolation harness almost line-for-line

## Observation
`tests/par-body-restriction-registry-rows.test.ts` declares a module-scope
`fill(code, subs)` helper that reads a registry row's `Message` template and
substitutes `<placeholder>` tokens from a `ReadonlyMap`, throwing if a
placeholder in the template has no supplied substitution or if a supplied
substitution names no placeholder in the template. Its own doc comment states
it is "Shape mirrored from `fill` in bug 0194's witness,
tests/loop-element-withhold-binding-scoped.test.ts." That file already
declares a `fill(code, subs)` helper with the identical two-throw control
flow, differing only in the source of the template (`shardedRow(code).message`
vs `registered(code)`, itself calling `registryMessage`) and the wording
inside each thrown `Error`.

## Evidence
tests/par-body-restriction-registry-rows.test.ts:167-188 (re-read immediately
before filing):
```ts
function fill(code: string, subs: ReadonlyMap<string, string>): string {
  const template = shardedRow(code).message;
  const used = new Set<string>();
  const message = template.replace(/<[a-z]+>/g, (token) => {
    const value = subs.get(token);
    if (value === undefined) {
      throw new Error(
        `harness precondition unmet: the ${code} Message template carries placeholder ${token}, which this file supplies no substitution for — the registry row changed shape (${REGISTRY_PAGE_LIST})`,
      );
    }
    used.add(token);
    return value;
  });
  for (const token of subs.keys()) {
    if (!used.has(token)) {
      throw new Error(
        `harness precondition unmet: this file substitutes ${token} into the ${code} Message, which does not carry it — the registry row changed shape (${REGISTRY_PAGE_LIST})`,
      );
    }
  }
  return message;
}
```

tests/loop-element-withhold-binding-scoped.test.ts:195-216 (re-read
immediately before filing):
```ts
function fill(code: string, subs: ReadonlyMap<string, string>): string {
  const template = registered(code);
  const used = new Set<string>();
  const message = template.replace(/<[a-z]+>/g, (token) => {
    const value = subs.get(token);
    if (value === undefined) {
      throw new Error(
        `harness: the ${code} Message template carries placeholder ${token}, which this file supplies no substitution for — the registry row changed shape (${REGISTRY_PAGE})`,
      );
    }
    used.add(token);
    return value;
  });
  for (const token of subs.keys()) {
    if (!used.has(token)) {
      throw new Error(
        `harness: this file substitutes ${token} into the ${code} Message, which no longer carries it — the registry row changed shape (${REGISTRY_PAGE})`,
      );
    }
  }
  return message;
}
```

Same regex (`/<[a-z]+>/g`), same variable names (`template`, `used`,
`message`, `token`, `value`), same two-guard control flow order (unsupplied
placeholder throws first inside `.replace`, unused substitution throws second
in the trailing `for`), same `Set<string>` bookkeeping to detect the unused
case. The only differences are the template-lookup expression and the exact
words inside the two `Error` strings.

## Why this is a problem
The duplicate is self-declared: the newer file's own doc comment
(tests/par-body-restriction-registry-rows.test.ts:164-165) names the older
file's `fill` as the shape it mirrors, rather than importing it. Neither
`tests/helpers/registry-oracle.ts` (which both files already import `REGISTRY`
or its row type from) nor any other module under `tests/helpers/` exports a
placeholder-interpolation function of this shape, so each file re-derives the
same two-guard interpolation logic against its own locally-read template
source.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts` already centralises the registry read both
files consume; a placeholder-`fill` export parameterised over a
template-lookup function is the natural extension of that existing module,
consistent with the newer file's own comment naming the older file's `fill` as
its model.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kinds; this finding is about a helper function's control flow, not a pinned
  count or inventory assertion.
- Recording-double check: `fill` performs a string substitution and throws on
  a shape mismatch; it records no calls and backs no "never called" witness,
  so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "function fill" docs/bugs/*.md` → 0
  hits; no open bug document discusses this duplication.
- coverage-matrix/bug-doc citation search: `grep -n
  "par-body-restriction-registry-rows\|loop-element-withhold-binding-scoped"
  docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no merge,
  rename, or deletion of either file or any `it()`/`describe()` name, only
  where the internal `fill` helper is defined.
- Coverage check: the claim is entirely about a repeated harness-function
  DEFINITION; every call site in each file continues to exercise its own
  file's diagnostics exactly as documented.
- Prior-finding search: `grep -rl "loop-element-withhold-binding-scoped"
  quality/resolved quality/issues quality/intake` shows two hits
  (PTQ-0468, PTQ-0633), neither of which mentions `fill` or the
  placeholder-interpolation helper — this is a distinct root cause from both.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at par-body-restriction-registry-rows.test.ts:167-188 and loop-element-withhold-binding-scoped.test.ts:195-216, sed-extracted and diffed → zero diff after normalising only the template-lookup expression, the `harness precondition unmet:`/`harness:` prefix, `does not`/`no longer carries` and the page-constant name; both copies are live (3 and 2 call sites), both under tests/, D7 boilerplate-duplication class, the self-declared mirror comment is real at :164-165, no gate/recording-double/red-test carve-out, and the stated searches reproduce (docs/bugs `function fill` → 0; coverage-matrix cites → 0; the 6 bug docs citing either file do so only as witnesses and no it()/describe()/file change is proposed); the anchor holds — tests/helpers exports no two-guard fill (registry-oracle.ts:59 `interpolate` is lenient, leaving unknown placeholders intact and never throwing; load-row-harness.ts:62-91 `registryMessageOf` guards presence-only and is load-shard-scoped) — but the filing undercounts: `function fill(code, subs: ReadonlyMap)` with the same `/<[a-z]+>/g` regex and `used.has(token)` second guard is redeclared in 15 tests/*.test.ts files (arg-mismatch-diagnostic-count-by-surface, array-ternary-common-type-union, division-result-type-number, fn-arg-member-read-proof, fn-arg-type-mismatch-wired, invoke-arg-array-literal-provable, invoke-arg-type-mismatch-wired, let-arm-withhold-binding-scoped, match-arm-scope-inference-pass, modulo-zero-result-type-number, params-declared-type-in-type-layer, plain-for-loop-variable-element-type + the two cited), so treat these two as the canonical slice and fold the remaining 13 sites into the location list at acceptance; not a duplicate — PTQ-0549 names fill only inside the division/modulo whole-harness pair bundle and PTQ-0786 covers tests/live per-code Fragment renderers against load-row-harness, neither tracks the missing shared two-guard fill (triage: claude-fable-5-1)
