---
id: PTQ-1591
title: Bug 0320's residual R4 says exact message substitution is witnessed by `parseExpectedMessage` in tests/uppercase-pi-tool-name-refusal.test.ts, but commit d34431e6 deleted that helper and 0320 does not note it
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0320-tools-entry-extension-rule-unenforced.md:282-285
  - tests/uppercase-pi-tool-name-refusal.test.ts:505-531
  - tests/helpers/registry-oracle.ts
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0320's residual R4 says exact message substitution is witnessed by `parseExpectedMessage` in tests/uppercase-pi-tool-name-refusal.test.ts, but commit d34431e6 deleted that helper and 0320 does not note it

## Observation
Bug 0320 (Status: fixed (0.327.0)) records residual R4 as "mitigated". Its e2e witness only matches the message loosely (`<path>` opened to `.+`), so R4 relies on a second witness for exact substitution: the C5 unit seam in `tests/uppercase-pi-tool-name-refusal.test.ts`, identified by the helper name `parseExpectedMessage`. Commit d34431e6 ("quality: qw20260923185337 fix tests__p2", 2026-09-23) deleted that local helper. It moved the C5 cell to the shared `expectedMessage` oracle from `tests/helpers/registry-oracle.ts`. `parseExpectedMessage` now has 0 hits under tests/. The record was last touched at its fix commit dc4c19cc (2026-09-01) and carries no note of the change.

## Evidence
Claim side (re-read immediately before filing), `docs/bugs/0320-tools-entry-extension-rule-unenforced.md:282-285`:
```
  3. R4 (mitigated) — the e2e witness's message assertion opens `<path>` to
    `.+`; exact-substitution is witnessed at the C5 unit seam
    (`tests/uppercase-pi-tool-name-refusal.test.ts`, `parseExpectedMessage`)
    and in cell H (exact registry-template equality).
```

Evidence side:
- `git grep -n "parseExpectedMessage" -- tests` → 0 hits.
- `grep -rn "parseExpectedMessage" docs/bugs` → 1 hit, this record at :284.
- `git log --format="%h %ad %s" --date=short -S parseExpectedMessage -- tests/uppercase-pi-tool-name-refusal.test.ts` → `d34431e6 2026-09-23 quality: qw20260923185337 fix tests__p2` (removal) and `dc4c19cc 2026-09-01 fix(bug-0320): …` (introduction).
- `git show d34431e6 -- tests/uppercase-pi-tool-name-refusal.test.ts` removes `function parseExpectedMessage(code, subs)` ("Source a code's registered *Message* template from the PARSE registry page."). It rewrites the C5 assertion from `parseExpectedMessage(INVOKE_NON_THETA_EXTENSION_CODE, { "<path>": spec })` to `expectedMessage(PARSE_REGISTRY, INVOKE_NON_THETA_EXTENSION_CODE, { "<path>": spec })`.
- Equivalent witness at HEAD, `tests/uppercase-pi-tool-name-refusal.test.ts:505-531` (excerpt):
```
describe("Bug 0108 (C5) — the isBareIdentifier arm split is undisturbed ", () => {
  it.each(["web-search", "web.search", "9tool"])(
    "theta/parse/invoke-non-theta-extension: `%s` keeps its current code and message",
  ...
      expect(dg?.message).toBe(
        expectedMessage(PARSE_REGISTRY, INVOKE_NON_THETA_EXTENSION_CODE, { "<path>": spec }),
      );
```
  Line 1 of that file is `import { expectedMessage, readRegistry } from "./helpers/registry-oracle";`.
- `git log -1 --format="%h %ad" --date=short -- docs/bugs/0320-tools-entry-extension-rule-unenforced.md` → `dc4c19cc 2026-09-01`, before the d34431e6 removal.

## Why this is a problem
R4's "mitigated" rests on a named witness, and the name it gives no longer exists anywhere in tests/. The exact-substitution check itself survives in the same C5 cell under a different oracle. A reader who follows the pointer finds nothing, and cannot confirm the mitigation without re-deriving where the check went.

## Suggested direction (non-binding, optional)
Re-point the R4 pin to the C5 `it.each` cell at `tests/uppercase-pi-tool-name-refusal.test.ts:505-531` and its `expectedMessage` (registry-oracle) assertion. This is a mechanical citation refresh.

## False-positive check
- Helper name: 0 hits under tests/ (search above). No rename or re-export under the same name.
- Commit attribution: `git log -S parseExpectedMessage` on the file gives exactly two commits, the introduction (dc4c19cc) and the removal (d34431e6).
- Other records in this shard: symbol names removed by d34431e6 (function and const declarations from the `-` side of the diff) were matched against docs/bugs/0318-0338. Only `parseExpectedMessage` appears as a cited pin, in 0320. The other hits were common words such as "theta", "observed", "producer" and "execute". So 0320 is the only affected record in this shard.
- Pending candidates: no pending intake file mentions `d34431e6` (`grep -ln d34431e6 quality/intake/*` → 0).
- Gate coverage: `tests/citation-symbol-form-gate.test.ts:39` states "`docs/bugs/**` is absent by design", so no gate resolves this symbol pin.
- Cell H, the other half of R4's evidence: `tests/b0320-tools-entry-extension-rule-unenforced.test.ts` exists with 10 `it(` sites. That half is not part of this filing.

## Triage
verdict: confirmed — decay verified: 0320:282-285 R4 pins `parseExpectedMessage`, which has 0 hits under tests/ now; `git log -S` shows dc4c19cc added it and d34431e6 removed it (the diff deletes `function parseExpectedMessage(` and rewrites the C5 assertion to `expectedMessage(PARSE_REGISTRY, …)`). The record was last touched at dc4c19cc. The equivalent is unambiguous and still exists: tests/uppercase-pi-tool-name-refusal.test.ts describe "Bug 0108 (C5) — the isBareIdentifier arm split is undisturbed", it.each "theta/parse/invoke-non-theta-extension: `%s` keeps its current code and message" (~:505-531), which asserts exact `expectedMessage(PARSE_REGISTRY, INVOKE_NON_THETA_EXTENSION_CODE, { "<path>": spec })` from tests/helpers/registry-oracle.ts. The fix is a mechanical re-point. No other intake/issue carries d34431e6, and resolved PTQ-1396 is the D7 dedupe that caused this decay, not the same finding (triage: claude-opus-5-5)
