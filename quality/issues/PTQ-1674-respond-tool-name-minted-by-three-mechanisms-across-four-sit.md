---
id: PTQ-1674
title: The synthesised respond-tool name `__theta_respond_<slug>` is minted by three mechanisms across four production sites — `respondToolName()` string concat, `contentAddressedName`'s template literal with counter, and two `?? "__theta_respond_" + slug` inline fallbacks — while the exporting module's own doc and the bug-0488 fix record count the mints as single-sourced across two
lens: D1
status: open
verdict: confirmed
locations:
  - src/runtime/typed-query-validation.ts:383-399
  - src/runtime/typed-query-validation.ts:200-204
  - src/runtime/tool-registration.ts:564-574
  - src/runtime/query-followup-render.ts:104-108
  - src/runtime/query-followup-render.ts:165-170
  - src/extension/query-text-render.ts:160-168
  - src/extension/production-theta-producer.ts:1324-1338
  - src/extension/production-theta-producer.ts:1271-1275
  - src/parser/synthesised-names.ts:34-36
sites: 4
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# The synthesised respond-tool name `__theta_respond_<slug>` is minted by three mechanisms across four production sites — `respondToolName()` string concat, `contentAddressedName`'s template literal with counter, and two `?? "__theta_respond_" + slug` inline fallbacks — while the exporting module's own doc and the bug-0488 fix record count the mints as single-sourced across two

## Observation
The name of the synthesised typed-query respond tool (`__theta_respond_<slug>`, optionally `_<n>` under a PIC-44 collision) is produced in four places in `src/` by three different mechanisms. `src/runtime/typed-query-validation.ts` exports `respondToolName(slug)` (string concatenation) and documents it as "single-sourcing the `__theta_respond_` PREFIX across those two sites", naming `tool-registration.ts#contentAddressedName` as the one separate mint. `contentAddressedName` builds the registered name with its own template literal plus a collision counter. `src/runtime/query-followup-render.ts` carries two more inline mints — `input.toolName ?? "__theta_respond_" + input.slug` in `renderFollowUpTurn` and again in `renderInitialRespondTurn` — that neither the exporting module's doc nor the bug-0488 fix record ("single-sourcing the name-prefix") mentions. The two production callers of the render functions both thread `toolName`, so the two inline fallbacks are production-unfed arms that still restate the recipe. The recogniser regex in `src/parser/synthesised-names.ts` is the consumer that every mint must agree with.

## Evidence

**Way 1 — shared function (concat).** `src/runtime/typed-query-validation.ts:383-399` (re-read before filing):
```ts
/**
 * The synthesised respond-tool name for a canonical slug: `"__theta_respond_" + slug`.
 *
 * WHY exported (bug 0488): the launch-time allowlist enumeration
 * (`collectLaunchRespondNames`, `production-theta-producer.ts`) and this
 * module's `:205` validation fallback both mint the respond name through this
 * function, single-sourcing the `__theta_respond_` PREFIX across those two
 * sites. The name the child actually registers is minted separately by
 * `contentAddressedName` (`tool-registration.ts`) through its own
 * `__theta_respond_${slug}` literal (it also appends a `_<n>` collision
 * counter), so parity between the launch-carried name and the registered name
 * is TEST-enforced (the bug-0488 name-mint parity oracle), not guaranteed by
 * construction.
 */
export function respondToolName(slug: string): string {
  return "__theta_respond_" + slug;
}
```
Its two production callers — the launch-time allowlist enumeration, `src/extension/query-text-render.ts:167`:
```ts
      names.add(respondToolName(respondSchemaSlug(lowered)));
```
and the validation-side fallback, `src/runtime/typed-query-validation.ts:200-204`:
```ts
  constructor(input: TypedQueryValidationInput) {
    this.#input = input;
    this.#slug = respondSchemaSlug(input.lowered);
    this.#toolName = input.respondToolName ?? respondToolName(this.#slug);
    this.#wire = respondToolWireSchema(input.lowered);
```

**Way 2 — template literal with counter (the name the host actually registers).** `src/runtime/tool-registration.ts:564-574`:
```ts
/**
 * The content-addressed registration name for a lowered tool. With no counter,
 * the base name; with a per-slug disambiguation counter `n`, the collision form
 * (`__theta_callee_<slug>_<n>__<post-rename-name>` / `__theta_respond_<slug>_<n>`).
 */
function contentAddressedName(entry: RegistrationEntry, n?: number): string {
  const counter = n === undefined ? "" : `_${n}`;
  return entry.kind === "callee"
    ? `__theta_callee_${entry.slug}${counter}__${entry.postRenameName}`
    : `__theta_respond_${entry.slug}${counter}`;
}
```
Reached in production through `registerToolInCache` from `src/extension/production-theta-producer.ts:1324-1338` (`#registerRespondTool`):
```ts
  #registerRespondTool(lowered: LoweredSchema): {
    readonly slug: string;
    readonly toolName: string;
  } {
    const slug = respondSchemaSlug(lowered);
    const toolName = registerToolInCache(
      this.#respondRegistrationCache,
      { kind: "respond", slug, canonicalFormBytes: canonicalForm(toLoweredJsonValue(lowered)) },
```

**Way 3 — inline `??` fallback, twice.** `src/runtime/query-followup-render.ts:104-108`:
```ts
export function renderFollowUpTurn(input: FollowUpTurnInput): string {
  const instructionAndSchema = renderInstructionAndSchema(
    input.loweredSchema,
    input.toolName ?? "__theta_respond_" + input.slug,
  );
```
and `src/runtime/query-followup-render.ts:165-170`:
```ts
export function renderInitialRespondTurn(input: InitialRespondTurnInput): string {
  return renderInstructionAndSchema(
    input.loweredSchema,
    input.toolName ?? "__theta_respond_" + input.slug,
  );
}
```

**The consumer every mint must agree with.** `src/parser/synthesised-names.ts:34-36`:
```ts
const RESERVED_SYNTHESISED_NAME = new RegExp(
  `^(?:__inline_${HEX16}|__theta_respond_${HEX16}|__theta_bind_${HEX16}|__theta_callee_${HEX16}__[A-Za-z0-9_]+)$`,
);
```

**Counts, both ways.** Production mint expressions: search `grep -rn "\"__theta_respond_\" +\|__theta_respond_\${" src/` → 7 hits:
```
src/parser/synthesised-names.ts:35:  `^(?:__inline_${HEX16}|__theta_respond_${HEX16}|__theta_bind_${HEX16}|__theta_callee_${HEX16}__[A-Za-z0-9_]+)$`,
src/runtime/query-followup-render.ts:107:    input.toolName ?? "__theta_respond_" + input.slug,
src/runtime/query-followup-render.ts:168:    input.toolName ?? "__theta_respond_" + input.slug,
src/runtime/tool-registration.ts:573:    : `__theta_respond_${entry.slug}${counter}`;
src/runtime/typed-query-validation.ts:384: * The synthesised respond-tool name for a canonical slug: `"__theta_respond_" + slug`.
src/runtime/typed-query-validation.ts:392: * `__theta_respond_${slug}` literal (it also appends a `_<n>` collision
src/runtime/typed-query-validation.ts:398:  return "__theta_respond_" + slug;
```
(4 code mints at `:107`, `:168`, `:573`, `:398`; 1 recogniser at `synthesised-names.ts:35`; 2 doc-comment lines.)

Callers of the shared function: search `grep -rn "respondToolName(" src/` → 3 hits:
```
src/extension/query-text-render.ts:167:      names.add(respondToolName(respondSchemaSlug(lowered)));
src/runtime/typed-query-validation.ts:203:    this.#toolName = input.respondToolName ?? respondToolName(this.#slug);
src/runtime/typed-query-validation.ts:397:export function respondToolName(slug: string): string {
```
Callers of `contentAddressedName`: search `grep -rn "contentAddressedName(" src/` → 3 hits:
```
src/runtime/tool-registration.ts:523:  const baseName = contentAddressedName(entry);
src/runtime/tool-registration.ts:551:  const disambiguated = contentAddressedName(entry, n);
src/runtime/tool-registration.ts:569:function contentAddressedName(entry: RegistrationEntry, n?: number): string {
```
Callers of the two render functions (whether the Way-3 fallbacks are fed): search `grep -rn "renderFollowUpTurn(\|renderInitialRespondTurn(" src/` → 4 hits:
```
src/extension/production-theta-producer.ts:1271:      template: renderInitialRespondTurn({
src/runtime/query-followup-render.ts:104:export function renderFollowUpTurn(input: FollowUpTurnInput): string {
src/runtime/query-followup-render.ts:165:export function renderInitialRespondTurn(input: InitialRespondTurnInput): string {
src/runtime/typed-query-validation.ts:245:        const prompt = renderFollowUpTurn({
```
Both production callers thread `toolName` — `src/extension/production-theta-producer.ts:1271-1275`:
```ts
      template: renderInitialRespondTurn({
        loweredSchema: respondToolWireSchema(lowered),
        slug,
        toolName,
      }),
```
and `src/runtime/typed-query-validation.ts:245-251` passes `toolName: this.#toolName` — so the two `?? "__theta_respond_" + input.slug` arms are production-unfed restatements of the recipe.

**No test relates Way 1 to Way 2.** Search `grep -rl "registerToolInCache" tests/ | xargs grep -l "respondToolName\b"` → 1 file, `tests/tool-registration-lifetime.test.ts`, whose only `respondToolName` occurrences are prose in a test title (`:88`) and a comment (`:95`); its assertions pin `contentAddressedName`'s output against a fresh literal (`:285-286`: `` expect(first).toBe(`__theta_respond_${slug}`) ``), and `tests/b0488-launch-respond-enumeration.test.ts:98` pins `respondToolName`'s output against a fresh literal (`` `__theta_respond_${expectedSlug}` ``). The "TEST-enforced parity" the doc names is two independent pins of the same literal, not a comparison of the two mints.

**The undercount already written down.** `docs/bugs/0488-subagent-tools-allowlist-suppresses-typed-query-respond-tool.md:168-171`:
```
  - `src/runtime/typed-query-validation.ts` — new `respondToolName(slug)`
    (`"__theta_respond_" + slug`), single-sourcing the name-prefix; the drive
    layer's `:205` mint routed through it; slug stays `respondSchemaSlug`
    (canonical form, bug 0099). (§Fix step 2.)
```
`git log --oneline -S'"__theta_respond_" + input.slug' -- src/runtime/query-followup-render.ts` → `30492948 fix(bug-0010) …` — the two Way-3 mints predate the 0488 "single-sourcing" commit (`d9b04b8c`) and were not routed through it.

**Self-inconsistency statement.** No written rule names one owner for the synthesised-name recipe; the anchor is self-inconsistency plus the cost cited below — the exporting module's doc (`typed-query-validation.ts:386-394`) and the 0488 fix record both describe the mint as single-sourced across two sites while four production mint expressions exist.

## Why this is a problem
The same value — the respond-tool name the provider is forced to, the name registered with the host, the name carried on the child `--tools` allowlist, and the name the QRY-12/QRY-15 templates instruct the model to call — is derived by three mechanisms in three modules, and the recipe's own documentation misstates the count. A maintainer who follows `typed-query-validation.ts:386-394` or the 0488 fix record to change the prefix or the slug derivation updates `respondToolName` and `contentAddressedName` and leaves the two `query-followup-render.ts` fallbacks (and, unless they also find `synthesised-names.ts:35`, the recogniser) on the old recipe; nothing in the type system or in any test joins the four mints, since each is pinned separately against a literal. The already-recorded misread is the demonstrated cost: the 0488 fix claimed "single-sourcing the name-prefix" while two mint sites remained untouched, and the doc it wrote names one other mint when there are three.

## Suggested direction (non-binding, optional)
Unproven hypothesis: one recipe function that takes the slug and an optional collision counter, consumed by the registration cache, the launch enumeration, and the two renderers' fallbacks, would make the parity the doc calls "TEST-enforced" hold by construction; whether the renderers should keep a fallback at all (both production callers thread the registered name) is a separate question the fix stage owns.

## False-positive check
- **Injected clone map:** no group covers any of the four mint sites (the only group in this shard, G026, is `subagent-wire-form.ts:159-182` ↔ `wire-form-depth-walk.ts:67-88`); the four expressions differ in mechanism (concat / template-with-counter / `??`-fallback), so this is not a token-level copy.
- **D9-affinity check:** not a wrong-home claim — the registration cache, the validation collaborator, and the renderers each legitimately need the name; the finding is that they derive it independently.
- **D2-deadness check:** all sides live — `respondToolName` has 2 production callers, `contentAddressedName` 2, the render functions 2 production callers each threading `toolName` (the `??` arms are exercised by tests that omit `toolName`).
- **Export-style exemption:** n/a (divergent-solutions; no claim rests on an export having no importer).
- **Prior filings:** `grep -rln "routeInternalError\|__theta_respond_\|respondToolName\|contentAddressedName" quality/intake/ quality/issues/` → 0 hits; resolved PTQs mentioning the literal (PTQ-0143, PTQ-0519, PTQ-0729, PTQ-1344, PTQ-1473) are test-harness or slug-oracle findings whose fixes did not touch these four mint sites. The qw20260921183818 D8 shard-16 note declined "respondToolName vs contentAddressedName" as self-documented; that note counted two sites and did not see the `query-followup-render.ts` pair, which is the misread this filing cites.
- **Git history intent:** `d9b04b8c` (0488) introduced `respondToolName` and routed one of the two `typed-query-validation.ts` mints through it; `30492948` (bug 0010) introduced the renderer fallbacks; `2bc69157` (rename) is the last touch of the `tool-registration.ts` literal — no commit joined them.
- **Self-inconsistency statement:** no written rule exists; the anchor is self-inconsistency plus the cost cited above.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. All five stated searches reproduce line for line (7/3/3/4 hits). The four mints are real: typed-query-validation.ts:398 concat, tool-registration.ts:573 template+counter, and query-followup-render.ts:107/:168 `??` fallbacks. Both production render callers (production-theta-producer.ts:1271-1275, typed-query-validation.ts:245-251) pass toolName. clone-scan map shows no groups for typed-query-validation.ts or query-followup-render.ts. The cost is a concrete recorded misread: the respondToolName doc (:386-394) and the bug-0488 Fix record (:168-171) both claim two-site single-sourcing, but the query-followup-render pair (from 30492948, which predates d9b04b8c) was never routed through it. No D2/D4/D8/D9 candidate or PTQ tracks this (shard-18 D1 routed it but did not file it). (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: one recipe for the `__theta_respond_` name. (1) src/runtime/tool-registration.ts contentAddressedName (:564-574): the respond arm delegates — `respondToolName(entry.slug) + counter` (import from ../runtime/typed-query-validation; the callee arm is untouched). (2) src/runtime/query-followup-render.ts: delete the two production-unfed fallback mints (:107, :168) — toolName becomes required on FollowUpTurnInput/InitialRespondTurnInput and the `?? "__theta_respond_" + input.slug` arms go; update the tests that omitted toolName to pass respondToolName(slug). (3) Truth respondToolName's doc (typed-query-validation.ts:383-396): it single-sources the prefix across ALL mints (registration via delegation, launch enumeration query-text-render.ts:167, the :203 validation fallback), with synthesised-names.ts:35's recogniser named as the one non-mint reader; drop the "minted separately … parity is TEST-enforced" paragraph (parity now holds by construction). Behaviour identical — byte-identical names on every path.
