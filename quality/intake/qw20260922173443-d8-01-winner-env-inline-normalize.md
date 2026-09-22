---
id: pending
title: spawnSubagentConversation inlines the backslash-to-slash rewrite for the control-plane winner path instead of the shared normalizePath helper
lens: D8
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:2597-2598
  - src/normalize-path.ts:24-26
sites: 1
fix_scope: localized
d8_class: reimplemented
d8_host: src/extension/production-theta-producer.ts#ProductionThetaProducer.spawnSubagentConversation
wave: qw20260922173443
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-22
---

# spawnSubagentConversation inlines the backslash-to-slash rewrite for the control-plane winner path instead of the shared normalizePath helper

## Observation
`spawnSubagentConversation` builds the child launch's control-plane env and
forward-slash-normalises `theta.sourcePath` for `SUBAGENT_ROOT_WINNER_ENV` with
an inline `.replace(/\\/g, "/")`. The repo already owns a canonical helper for
exactly this rewrite — `normalizePath` in `src/normalize-path.ts`, minted by the
PTQ-0342 consolidation and described in its own header as the single shared
implementation so a correction (doubled leading slash, UNC prefix) reaches every
call site. `production-theta-producer.ts` does not import it (search:
`normalizePath|normalize-path` in the file, 0 hits).

## Evidence
Fighting site — src/extension/production-theta-producer.ts:2591-2599 (re-read
before filing):
```ts
    const controlPlaneEnv: Record<string, string | undefined> = {
      ...marshalled.env,
      [SUBAGENT_CALLABLE_HASHES_ENV]:
        Object.keys(callableHashes).length > 0
          ? JSON.stringify(callableHashes)
          : undefined,
      [SUBAGENT_ROOT_WINNER_ENV]:
        theta.sourcePath !== undefined ? theta.sourcePath.replace(/\\/g, "/") : undefined,
    };
```

Facility — src/normalize-path.ts:24-26 (its header names the shared-correction
rationale, PTQ-0342):
```ts
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
```

Feature-for-feature: byte-identical transformation (`replace(/\\/g, "/")`); the
inline site adds no behaviour the helper lacks and needs none (the surrounding
comment at 2588-2590 explains only WHY the value is normalised — "Forward-slash
normalized defensively" — not why it is normalised by a private copy). Same
shape as the already-resolved PTQ-1116 ("pass-parse-cache reimplements
normalize-path"), which converted another inline copy in `src/extension/` to
the import.

## Why this is a problem
The winner-path value is the child's collision-resolution comparison key
(comment at 2588-2590): a future correction to `normalizePath` (the header's own
examples — doubled leading slash, UNC `\\server\share`) would reach the
discovery-side normalisation of `sourcePath` but not this private copy of the
rewrite, silently diverging the comparison key from the value discovery
compares against — the exact divergence PTQ-0342's consolidation exists to
prevent. Sibling inline copies also exist in `production-composition.ts`,
`callable-closure-path.ts`, and `subagent-callable-hash.ts`, but those files are
outside this shard's manifest; only the in-scope site is filed.

## Suggested direction (non-binding, optional)
Unproven hypothesis: import `normalizePath` from `../normalize-path` and use it
at the one site; no behaviour change.

## False-positive check
Exemption check: the D8 exemption on this file keys
`#firstAdmittingArmProperties` (class `reimplemented`, different function host)
— distinct host key, so not silenced. Prior-filing check: grepped
quality/intake/ and quality/issues/ for `normalizePath` / `normalize-path` /
`2598` — only resolved PTQ-0342/PTQ-1116 (different sites) match; PTQ-1247
(unused imports in this file) and PTQ-1150/residual D9 filings do not name this
site. Spec check: no docs/spec_topics/ clause mandates a private rewrite; the
Lexical "Path literals" rule is what `normalizePath` itself implements. D2
belt precedent: the documented rationale at 2588-2590 justifies normalising
defensively, not hand-rolling the normaliser — the belt is preserved by the
import.

## Triage
verdict: questionable — accounting verified: inline `theta.sourcePath.replace(/\\/g, "/")` reproduces at production-theta-producer.ts:2598 inside `spawnSubagentConversation` (decl 2447); `normalizePath` at src/normalize-path.ts:24-26 is byte-identical and its header states the PTQ-0342 shared-correction rationale; 0 hits for `normalizePath|normalize-path` in the file; the only D8 exemption on the file keys `#firstAdmittingArmProperties` (distinct host); no open/resolved PTQ names this site (PTQ-0342/1084/1116/1127 cover other copies; sibling copies in production-composition.ts, callable-closure-path.ts, subagent-callable-hash.ts remain but are outside the shard); facility covers the one need and no spec clause is dropped — the simpler shape is a design decision for a human ruling per D8 (triage: claude-fable-5-1)
