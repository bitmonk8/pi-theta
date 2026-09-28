---
id: PTQ-1536
title: The binder seed-field mapping is held in two tables — the runtime reads the un-exported 4-row `BINDER_SEED_FIELD_BY_API` while the step-6 Api-coverage gate asserts over the 12-row `PROVIDER_SEED_FIELD_TABLE` shadow — unlike the sibling temperature and forced-tool tables, which the same gate reads directly
lens: D1
status: open
verdict: confirmed
locations:
  - src/binder/binder-inference.ts:62-76
  - src/binder/binder-inference.ts:482-487
  - src/extension/version-bump-gates.ts:72-99
  - src/binder/binder-temperature.ts:73-79
  - src/binder/binder-temperature.ts:95-118
  - src/binder/forced-tool-choice.ts:98-101
  - tests/version-bump-gates.test.ts:174-200
sites: 3
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260927231131
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-27
---

# The binder seed-field mapping is held in two tables — the runtime reads the un-exported 4-row `BINDER_SEED_FIELD_BY_API` while the step-6 Api-coverage gate asserts over the 12-row `PROVIDER_SEED_FIELD_TABLE` shadow — unlike the sibling temperature and forced-tool tables, which the same gate reads directly

## Observation

`src/binder/` holds three per-api tables keyed on the resolved binder model's
`Model<Api>.api`: the seed-field table (`binder-inference.ts`), the temperature
placement table (`binder-temperature.ts`), and the forced-tool-choice spelling
table (`forced-tool-choice.ts`). The step-6 `Api`-coverage gate
(`apiCoverageFailures`, `tests/version-bump-gates.test.ts`) asserts every pinned
pi-ai `Api` value is a row key of each table. For the temperature and forced-tool
tables the gate imports the runtime constant itself (`BINDER_TEMPERATURE_TABLE`,
`FORCED_TOOL_CHOICE_API_KEYS`). For the seed-field mapping it imports a second,
separately maintained table, `PROVIDER_SEED_FIELD_TABLE` in
`src/extension/version-bump-gates.ts`, which the runtime never reads; the
runtime reads the module-private `BINDER_SEED_FIELD_BY_API`. The two seed
tables encode "no seed" differently (`undefined` / absent key versus the literal
`"omitted"`) and have already diverged in width: 4 rows versus 12.

## Evidence

### Way A — the runtime table the binder call actually consults

src/binder/binder-inference.ts:62-76 (re-read before filing):

```ts
/**
 * The per-provider binder seed-field mapping
 * (provider-error-mapping.md §"Provider seed-field mapping"), keyed on the
 * resolved binder model's `api` field. A provider whose row omits the seed
 * field maps to `undefined` and receives no seed key; a provider absent from the
 * table likewise receives none. Held as a single named constant so the
 * seed-supporting set has one source of truth to widen (a spec-versioned change).
 */
const BINDER_SEED_FIELD_BY_API: Readonly<Record<string, string | undefined>> =
  Object.freeze({
    "openai-completions": "seed",
    mistral: "random_seed",
    "anthropic-messages": undefined,
    "amazon-bedrock": undefined,
  });
```

src/binder/binder-inference.ts:482-487:

```ts
  // Provider seed-field mapping: place the fixed seed under the provider's seed
  // field name, when its row carries one; omit it otherwise.
  const seedField = BINDER_SEED_FIELD_BY_API[input.model.api];
  if (seedField !== undefined) {
    (options as Record<string, unknown>)[seedField] = input.seed;
  }
```

Reference count for Way A:
`grep -rn "BINDER_SEED_FIELD_BY_API" --include=*.ts src tests tools extensions`
→ 3 hits: the declaration (`binder-inference.ts:70`), the runtime read
(`binder-inference.ts:484`), and a comment in `version-bump-gates.ts:89`. The
constant is not exported and no test reads it.

### Way B — the shadow table the coverage gate asserts over

src/extension/version-bump-gates.ts:72-99 (excerpt, rows continue to :99):

```ts
/**
 * The provider seed-field table (provider-error-mapping.md
 * #provider-seed-field-mapping), keyed on the resolved binder model's `Api`
 * value. A provider that carries a fixed seed maps to its request-payload field
 * name; a provider with no seed field maps to the literal `"omitted"`. The row
 * keys are the coverage domain the `Api`-coverage gate asserts every pi-ai `Api`
 * literal-union value appears in. ...
 */
export const PROVIDER_SEED_FIELD_TABLE: Readonly<Record<string, string>> =
  Object.freeze({
    "openai-completions": "seed",
    mistral: "random_seed",
    "anthropic-messages": "omitted",
    "amazon-bedrock": "omitted",
    // Bug 0417 widened the coverage domain to the ten `KnownApi` members. None
    // of the widened rows sends a binder seed: the runtime seed table
    // (`BINDER_SEED_FIELD_BY_API`) keys the legacy `mistral`/`amazon-bedrock`
    // spellings, so a `KnownApi`-spelled model resolves no seed field; ...
    "mistral-conversations": "omitted",
    "bedrock-converse-stream": "omitted",
    "openai-responses": "omitted",
```

Reference count for Way B:
`grep -rn "PROVIDER_SEED_FIELD_TABLE" --include=*.ts src tests tools extensions`
→ 9 hits: the declaration (`version-bump-gates.ts:81`) and 8 in
`tests/version-bump-gates.test.ts` (:9, :176, :247, :248, :253, :255, :260,
:264). No `src/` file other than its own declaration reads it.

### The sibling tables — gated by identity, not by shadow

tests/version-bump-gates.test.ts:174-200 (the seed cell reads Way B; the
temperature cell reads the runtime constant):

```ts
describe("version-bump gate — step 6 provider seed-field Api-coverage", () => {
  it("step 6: reds when a pi-ai Api literal-union value is absent from the seed-field table row keys", () => {
    const tableKeys = Object.keys(PROVIDER_SEED_FIELD_TABLE);
    ...
  it("step 6: reds when a pi-ai Api literal-union value is absent from the binder temperature placement table row keys (bug 0064, ...)", () => {
    const temperatureTableKeys = Object.keys(BINDER_TEMPERATURE_TABLE);
```

`grep -rn "BINDER_TEMPERATURE_TABLE\b" --include=*.ts src tests tools extensions | grep -v "^src/binder/binder-temperature.ts"`
→ 3 hits, including `tests/version-bump-gates.test.ts:2` (import from
`../src/binder/binder-temperature`) and `:195`.

`grep -rn "FORCED_TOOL_CHOICE_API_KEYS\b" --include=*.ts src tests tools extensions | grep -v "^src/binder/forced-tool-choice.ts"`
→ 3 hits, all in `tests/version-bump-gates.test.ts` (:4, :223, :237), reading
the runtime table's keys exported at src/binder/forced-tool-choice.ts:98-101:

```ts
/** The forced-tool-choice table's row keys — the api-coverage gate's domain. */
export const FORCED_TOOL_CHOICE_API_KEYS: readonly string[] = Object.freeze(
  Object.keys(FORCED_TOOL_CHOICE_BY_API),
);
```

### Drift that already happened

`git log --oneline -S'"mistral-conversations": "omitted"' -- src/extension/version-bump-gates.ts`
→ 1 hit: `33bf327e fix(bug-0417): Responses binder toolChoice row + supported-api gate — v0.401.0`.
`git show 33bf327e --stat` lists `src/binder/binder-temperature.ts | 40 +-`,
`src/binder/forced-tool-choice.ts | 159 +++++-`, and
`src/extension/version-bump-gates.ts | 15 +` — and does NOT list
`src/binder/binder-inference.ts`. The commit message reads "forced-tool/
temperature/seed tables carry explicit measured rows or documented unmeasured
exclusions (no silent absence)"; the runtime seed table kept its 4 rows and its
absent-key ⇒ no-seed disposition. `git log --oneline -S'BINDER_SEED_FIELD_BY_API' -- src`
→ 2 hits (`33bf327e`, which only added the comment reference in
`version-bump-gates.ts`, and `3a93fd4e V9j`, the declaration).

### The misread already written into the sibling module

src/binder/binder-temperature.ts:73-79:

```ts
 * The per-(api, model-id) temperature placement table
 * (provider-error-mapping.md #binder-temperature-placement-mapping), keyed on
 * the resolved binder model's `Model<Api>.api`. Row keys are the pinned pi-ai
 * `Api` literal-union snapshot (`src/extension/sdk-inventory.ts`
 * `api-coverage`); the build-time `Api`-coverage assertion that guards the
 * seed-field table (`tests/version-bump-gates.test.ts`) guards this table too.
```

and `binder-temperature.ts:3` ("`binder-inference.ts`'s per-api seed-field
table") and `:48` ("symmetric with the seed-field table's own `"omitted"`
rows"). `grep -n "seed-field" src/binder/binder-temperature.ts` → 3 hits (:3,
:48, :78). Line 3 names the `binder-inference.ts` table as "the seed-field
table"; line 78 says the coverage gate guards "the seed-field table"; line 48
attributes `"omitted"` rows to it. The `binder-inference.ts` table has no
`"omitted"` rows (it uses `undefined`) and is not the table the gate reads.

### Self-inconsistency statement

No written rule pins how a per-api table must be gated; the anchor is
self-inconsistency plus the cost cited below. Three sibling tables in one
directory solve "keep this per-api table total over the pinned `Api` union" two
ways: two expose the runtime constant to the gate; one keeps the runtime
constant private and lets the gate read a hand-maintained shadow.

## Why this is a problem

The gate's stated purpose (version-bump-gates.ts:33-36: "every pi-ai `Api`
literal-union value is a seed-field table row key") is satisfied by a table the
binder call never consults, so a new `Api` value in the pinned snapshot reddens
against `PROVIDER_SEED_FIELD_TABLE` and can be fixed there without touching
`BINDER_SEED_FIELD_BY_API`. That is exactly what bug 0417 did: the shadow grew
from 4 to 12 rows while the runtime table stayed at 4, and the shadow's own
comment (version-bump-gates.ts:86-92) now documents the runtime's "no-row → no
seed" behaviour instead of the gate enforcing anything about it. The
`binder-inference.ts:67-68` claim "one source of truth to widen" is false by
count — there are two constants to widen — and `binder-temperature.ts:3/:48/:78`
already conflate them. A maintainer widening the seed-supporting set per the
spec ("a spec-versioned change") has to know to edit both files and both
encodings (`"random_seed"` in one, the same string in the other; `undefined`
versus `"omitted"` for absence), with no compiler or test tying them together
(`seedFieldFixtureFailures` compares `PROVIDER_SEED_FIELD_TABLE` against itself
and against local mutations at tests/version-bump-gates.test.ts:243-265).

## Suggested direction (non-binding, optional)

Unification hypothesis (unproven): one exported seed-field constant in
`src/binder/` read by both `buildBinderCompleteCall` and the step-6 gate, the
same shape the temperature and forced-tool tables already use — with the
coverage-domain rows expressed as explicit absence entries so the gate's domain
and the runtime's lookup are the same object.

## False-positive check

- Clone-map check: the shard's clone map lists "(no clone groups)" for
  `src/binder/binder-inference.ts`; no group covers this observation. The two
  tables are not token copies — they differ in value encoding (`undefined`
  versus `"omitted"`), width (4 versus 12 rows), export status, and file — so
  this is mechanism-shaped (how the gate is wired), not a D4 copy.
- D9-affinity check: this is not a wrong-home claim. Whether the runtime seed
  table belongs in `binder-inference.ts` or `binder-seed.ts` is routed to D9 in
  the shard notes and is independent of the two-table divergence filed here.
- D2-deadness check: both sides are live. `BINDER_SEED_FIELD_BY_API` is read at
  `binder-inference.ts:484` on every binder call; `PROVIDER_SEED_FIELD_TABLE`
  is read by 8 test sites in `tests/version-bump-gates.test.ts`.
- Export-style exemption: not applicable (divergent-solutions, not
  wide-surface).
- Spec check: `docs/spec_topics/pi-integration-contract/provider-error-mapping.md:56`
  requires the gate to assert "every value appears as a row key in the
  seed-field table constant" (singular). The spec's own table has 4 rows with
  the legacy `mistral`/`amazon-bedrock` spellings; no behaviour change is
  proposed or implied — which apis receive a seed is untouched.
- Prior-filing check: `grep -rli "PROVIDER_SEED_FIELD_TABLE\|BINDER_SEED_FIELD_BY_API\|seed-field" quality/issues quality/resolved quality/intake`
  → 2 hits (`PTQ-0134-surface-inventory-row-enumeration-stale.md`,
  `PTQ-0851-envelope-callinput-fixture-triplicated.md`); read both — neither
  concerns the seed-field table pair (one is a stale inventory-row roster, the
  other a test-fixture triplication). Not in the already-filed list under any
  matching topic.
- Self-inconsistency statement: no written rule exists; the anchor is
  self-inconsistency plus the cost cited above.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. Every stated search reproduced verbatim: BINDER_SEED_FIELD_BY_API 3 hits, PROVIDER_SEED_FIELD_TABLE 9, BINDER_TEMPERATURE_TABLE 3, FORCED_TOOL_CHOICE_API_KEYS 3, seed-field in binder-temperature.ts 3. Both ways match their excerpts: binder-inference.ts:70-76 is private, 4 rows, uses undefined, and is read at :484; version-bump-gates.ts:81-100 is exported, 12 rows, uses "omitted", and is read only by the tests. The gate reads the runtime constants for the temperature and forced-tool tables (test :195, :223). The clone-scan map lists no groups. The cost is real: 33bf327e (bug 0417) widened the shadow table and did not touch binder-inference.ts. The misread is concrete: binder-temperature.ts:3 and :48 credit "omitted" rows to binder-inference.ts's table, which has none. No existing PTQ or intake file covers this (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: one gate-audited seed-field table that the runtime reads. Re-home the 12-row PROVIDER_SEED_FIELD_TABLE (rows and "omitted" no-seed encoding unchanged, doc comment moved with it) from src/extension/version-bump-gates.ts into src/binder/binder-inference.ts as the exported constant, matching the sibling-table shape (BINDER_TEMPERATURE_TABLE and FORCED_TOOL_CHOICE_API_KEYS live beside their runtime readers); delete the private 4-row BINDER_SEED_FIELD_BY_API. The runtime read at binder-inference.ts:482-487 becomes: look up PROVIDER_SEED_FIELD_TABLE[input.model.api] and place the seed only when the row exists and is not the literal "omitted" — runtime behaviour identical (only openai-completions -> seed and mistral -> random_seed place a seed; every other or unknown api places none). version-bump-gates.ts keeps its gate functions (apiCoverageFailures and seedFieldFixtureFailures take the table or its keys as arguments) and loses the constant; update the PROVIDER_SEED_FIELD_TABLE import in tests/version-bump-gates.test.ts to ../src/binder/binder-inference (its 8 test references are the only consumers; no other test edits). Make the binder-inference.ts "one source of truth" doc comment true for the merged table, and correct the three seed-field comment references in binder-temperature.ts (:3, :48, :78) so they truthfully name PROVIDER_SEED_FIELD_TABLE in binder-inference.ts, its "omitted" rows, and its gate coverage. No other behaviour change; provider-error-mapping.md is untouched (the spec requires a singular gate-audited seed-field table constant, which this restores).
