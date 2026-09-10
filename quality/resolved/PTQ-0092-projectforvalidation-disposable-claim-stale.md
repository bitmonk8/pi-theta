---
id: PTQ-0092
title: projectForValidation's doc says the projection serves one validate call and every caller hands the ORIGINAL value downstream, but #recoverDeclaredDefaults stores the projection itself as DefaultedField.defaultValue
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/wire-translation.ts:665-669
  - src/extension/production-theta-producer.ts:1654-1657
  - src/binder/defaulting.ts:144
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# projectForValidation's doc says the projection serves one validate call and every caller hands the ORIGINAL value downstream, but #recoverDeclaredDefaults stores the projection itself as DefaultedField.defaultValue

## Observation
`projectForValidation`'s doc-comment scopes the function to a single use: the
projection exists "for that `validate` call only", "the caller of this
function hands the ORIGINAL value downstream unchanged on every path", and
"this projection is disposable". The function has two production callers. The
second, `#recoverDeclaredDefaults` (production-theta-producer.ts), performs no
`validate` call at its site: it stores the projection as
`DefaultedField.defaultValue`, discards the original evaluated value, and that
stored projection is later merged into binder args by
`fillDefaultsAndRevalidate` — the projection is the value handed downstream.

## Evidence
src/runtime/wire-translation.ts:665-669 — the doc's universal claim:

```
/**
 * Project a value to the shape the `invoke<T>` return-value AJV gate reads
 * structurally, for that `validate` call only. The caller of this function
 * hands the ORIGINAL value downstream unchanged on every path; this
 * projection is disposable and never itself crosses the invoke boundary.
```

src/extension/production-theta-producer.ts:1654-1657 — the second caller
(inside `#recoverDeclaredDefaults`, declared at :1582): the projection is
retained, the original `evaluated` is not referenced again:

```
      defaults.push({
        wireName,
        defaultValue: projectForValidation(evaluated),
      });
```

src/binder/defaulting.ts:144 — the stored projection crosses into the merged
binder-args record (which is then revalidated and bound):

```
      defineRecordField(merged, field.wireName, field.defaultValue);
```

The complete production caller set. Search: `projectForValidation` over `*.ts`
in src/, extensions/, tools/ — two call sites: the AJV gate the doc describes
(src/extension/production-theta-producer.ts:4553, `const verdict =
validator.validate(projectForValidation(result.value));`, with the original
`result.value` handed onward) and the defaults-recovery site above.

## Why this is a problem
Stale contract narration on a shared function: the doc's "on every path" and
"for that `validate` call only" were written when the invoke-return gate was
the sole caller (commit f912a8c3, bug 0174, v0.98.0) and were not revisited
when e73c1aca (bug 0181, v0.103.0) added a caller with the opposite retention
contract — there the projection is deliberately the kept value (the call-site
comment says the merge "is what `DefaultedField.defaultValue` … already
contracts for"). A reader of the function's doc concludes no projection ever
outlives its validate call, which the defaults path contradicts.

## Suggested direction (non-binding, optional)
Restate the doc's scope to what is invariant (a wire-form projection that
collapses the boxed enum carrier, copy-on-change) and let the two callers'
comments own their differing retention: the invoke gate discards it, the
defaults recovery keeps it as the contracted wire-form default.

## False-positive check
- Reference search: `projectForValidation` over `*.ts` in src/, extensions/,
  tools/, tests/ — production call sites exactly two (producer:4553,
  producer:1656); test hits are imports/comments in witness suites
  (b0465, ctor-proto-named-field, invoke-depth-wire-form-metric), none a
  third production path. No dynamic/string-keyed access (identifier calls
  only).
- Verified the downstream flow of the stored projection: `DefaultedField`
  (src/binder/defaulting.ts:35), consumed by `fillDefaultsAndRevalidate`
  (defaulting.ts:125) whose merge at :144 installs `field.defaultValue` into
  the args record — so the projection is not disposable on that path; and
  verified the first caller does match the doc (original `result.value`
  handed onward at producer:4555+ via `decodeInboundValue`).
- Git intent check: doc text landed f912a8c3 (bug 0174, v0.98.0; `git log -S
  "hands the ORIGINAL value downstream unchanged"`); second caller landed
  e73c1aca (bug 0181, v0.103.0; `git log -S "defaultValue:
  projectForValidation"`). The doc block is unchanged since 0174.
- Duplicate check: qw20260907130901-d2-02-wire-walk-line-citations-drifted
  cites this doc's `inbound-boundary.ts:68` pin as accurate and covers no
  prose claim; no other filed finding or triage-log row names
  projectForValidation's caller contract.

## Triage
verdict: confirmed — all three excerpts verbatim at the cited lines; my own grep finds exactly two production callers (no re-exports, no dynamic access), and the second (producer:1656) runs no validate, discards `evaluated`, and stores the projection as `DefaultedField.defaultValue`, merged into bound args at defaulting.ts:144 — falsifying the doc's "for that validate call only" / "on every path" universal, which blame shows unchanged since f912a8c3 even though 0181's own commit message says it swept other falsified comments in this same file. (triage: claude-opus-5)
