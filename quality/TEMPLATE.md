# Finding template

Every candidate finding is one Markdown file in `quality/intake/`, exactly this
shape. One finding, one root cause — "and also" belongs in a second file. No
severity or priority language anywhere; `sites` and `fix_scope` are the only
size proxies. Nothing above the `## Triage` heading is edited after filing;
triage appends its note under that heading.

```markdown
---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: <symptom as one sentence; names the code, not the fix>
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/example/file.ts:308-353
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: <wave id>
reported_by: <worker> (<model>)
date: <YYYY-MM-DD>
---

# <title>

## Observation
<2-6 sentences. What the code is/does today. Facts only, no adjectives.>

## Evidence
<Per location: path:lines plus a verbatim excerpt (<= 15 lines each). Pattern
claims cite every counted site, or state the exact search used and its hit
count.>

## Why this is a problem
<Anchor to a named principle with mechanical evidence: dead code proven dead,
vestigial name with the historical meaning and current mismatch stated,
duplication with all copies cited, scaffolding with its feature's landing shown.
Taste alone does not qualify.>

## Suggested direction (non-binding, optional)
<At most one paragraph. A direction, not a design. No diffs. The fix stage owns
solutions.>

## False-positive check
<What was verified before filing: reference searches run (identifier use across
src/, extensions/, tools/, tests/; string-keyed/dynamic access; re-exports),
whether tests are the only callers (then it is NOT dead), git history intent
check. Name each check and what it showed.>

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
```
