---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: collectImportedTypeDecls maintains a visitedEnums set whose guard protects only the set's own add — the branch controls nothing observable
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/import-static-checks.ts:284
  - src/extension/import-static-checks.ts:328-345
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# collectImportedTypeDecls maintains a visitedEnums set whose guard protects only the set's own add — the branch controls nothing observable

## Observation
`collectImportedTypeDecls` (bug 0465's transitive-decl walk) declares two
visited sets. `visitedSchemas` fences `visitSchema`'s field-walk recursion —
its guard sits before the recursive loop. `visitedEnums` mirrors that shape
inside `visitEnum`, but `visitEnum` has no recursion and no statement after
the guarded `add`: the early `return` skips only `visitedEnums.add(...)`
itself, and the map storage above the guard is already idempotent
(`!enums.has(...)` first-wins). Removing the set, the `has` test, and the
`add` changes no observable behaviour.

## Evidence
src/extension/import-static-checks.ts:283-284 — the two sets, declared side by
side:
```ts
  const visitedSchemas = new Set<string>();
  const visitedEnums = new Set<string>();
```

src/extension/import-static-checks.ts:328-345 — the whole of `visitEnum`; the
guard is the final statement pair, so the early return skips only the `add`:
```ts
  const visitEnum = (sourceName: string, asName: string): void => {
    const decl = enumByName.get(sourceName);
    if (decl !== undefined && decl.variants !== undefined) {
      // Same dual storage as `visitSchema`: source name so a schema field
      // referencing this enum by its lib-local name resolves, plus the alias
      // when the entry was renamed. An enum has no field body to walk.
      if (!enums.has(sourceName)) {
        enums.set(sourceName, decl);
      }
      if (asName !== sourceName && !enums.has(asName)) {
        enums.set(asName, { ...decl, name: asName });
      }
    }
    if (visitedEnums.has(sourceName)) {
      return;
    }
    visitedEnums.add(sourceName);
  };
```

Contrast: `visitSchema`'s guard (same file, :314-322) precedes a recursive
loop, so there it terminates cycles:
```ts
    if (visitedSchemas.has(sourceName)) {
      return;
    }
    visitedSchemas.add(sourceName);
    if (decl === undefined || !hasShape) {
      return;
    }
    for (const typeSource of typeSourcesOf(decl)) {
      for (const ref of referencedNamedTypes(typeSource)) {
        visitSchema(ref, ref);
        visitEnum(ref, ref);
```

Reference search: `visitedEnums` across src/, tests/, tools/, extensions/,
docs/ (ts, js, md) → exactly the three lines above (declaration :284, read
:341, write :344). No other reader exists.

## Why this is a problem
Dead code, proven by structure: the only branch conditioned on `visitedEnums`
skips exactly one statement — the write that feeds the same set — and nothing
else in the function or module reads the set. The comment inside `visitEnum`
itself states the reason the guard has no job: "An enum has no field body to
walk." The set is a cargo-culted mirror of `visitSchema`'s recursion fence
copied into a function with no recursion, present since the function's
introducing commit (d03f7398, bug 0465) — it was born inert, not orphaned by a
later change.

## Suggested direction (non-binding, optional)
The set, its `has` test, and its `add` can be deleted from
`collectImportedTypeDecls` with no behavioural difference; the idempotent
`!enums.has(...)` storage already provides first-wins semantics.

## False-positive check
- Identifier search: `visitedEnums` across src/, tests/, tools/, extensions/,
  docs/ (all text file types) — 3 hits, all inside
  `collectImportedTypeDecls` (declaration, one read, one write). No re-export
  or barrel can reach a function-local `const`.
- String-keyed/dynamic access: impossible — the binding is a closure-local
  `const Set`, never attached to any object.
- Test-only-caller rule: no test references the identifier; the structure is
  behaviour-invisible (its removal cannot flip any assertion), so no witness
  test depends on it.
- Recursion check: read the entire `visitEnum` body — no self-call, no call to
  `visitSchema`, no statement after `visitedEnums.add`; callers are
  `visitSchema`'s ref loop (:326) and the entry seed (:351), both of which
  observe only the `enums` map.
- Spec/fail-closed check: the guard emits no diagnostic and gates no
  registration; imports.md's cycle rules are enforced elsewhere
  (`visitedSchemas` for this walk, IMP-5 for the lib graph), so nothing
  spec-mandated routes through this set.
- Git history intent: `git log -S "visitedEnums"` → one commit, d03f7398
  (bug 0465), which introduced the whole function; the guard never had a
  recursive body to fence.

## Triage
