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
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/example/file.ts:308-353
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/example/file.ts # D9 breakdown only: the exemption key, <path> or <path>#<function>
d9_band: justify             # D9 breakdown only: zone | justify | strong
d4_class: clone              # D4 only: clone | drift | parallel
d8_class: overbuilt          # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/example/file.ts # D8 only: the exemption key, <path> or <path>#<function>
challenges_spec: expressions.md#anchor # D8 only, optional: set when arguing against a spec clause
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
count. D9 breakdown: the distinct-concern inventory table (concern | members |
line ranges | LOC, >= 2 rows) or the function's step inventory. D9
misplacement: "touches M members of <foreign host>, N of its own", names
listed. D9 husk: payload-vs-scaffolding LOC and the remaining-caller count. D4:
every copy's path:line-range + excerpt, the identical/renamed-only/diverged
verdict, the clone-map group id when one exists. D8: the counted concept/layer
inventory, the reimplemented facility's own citation, or the documented-vs-
fighting usage quotes, or the data-size claim at the call sites.>

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
