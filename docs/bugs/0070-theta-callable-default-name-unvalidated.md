# Bug 0070 — A `.theta` entry's derived default callable name is never checked against the lowercase-first identifier rule the `as` target is checked against: `./2fast.theta` admits a callable named `2fast`, which no theta expression can spell

- **Status:** fixed (0.63.0).
- **Kind:** defect — `frontmatter-fields-a.md` §`tools` states the naming rule
  once and applies it to both name sources ("theta identifiers must be
  lowercase-first identifier-shaped"), but the implementation validates only the
  `as` override (`theta/load/invalid-tool-rename`) and admits any derived
  default name verbatim.
- **Related:**
  - 0016 (shadowed tool name / runtime dispatch) — established that the callable
    set's presented names are the arm-4 resolution names; a presented name the
    lexer cannot produce is unreachable at that arm.
  - 0051 (lowercase `NamedType` at reference positions silent) — same shape at
    the type surface: a casing rule enforced at the declaration position only.
- **Affected:**
  - `src/parser/callable-set.ts:350–356` (`thetaDefaultName` — basename stem,
    hyphens→underscores, no shape check),
  - `src/parser/callable-set.ts:183–190` (the sibling `as`-target check that
    *is* enforced, via `isLowercaseFirstIdentifier` at `:370`),
  - `src/parser/callable-set.ts:200` (`const name = parsed.rename ?? resolution.defaultName;`
    — the two name sources merge here, only one of them validated),
  - `src/discovery/discovery-walk.ts:76` (`theta/load/invalid-slash-name`, whose
    accepted stem regex `^[a-z0-9][a-z0-9_-]*$` admits a leading digit).
- **Observed at:** `0.52.0` (`d06daae3`), Windows. Offline, through the shipped
  production load path (`discoverAndComposeFixtures`) over a real on-disk
  `.pi/theta/` workspace.

## Summary

A `tools:` entry's presented name comes from one of two places: the `as`
override, or the derived default (Pi-tool name verbatim; `.theta` basename stem
with hyphens rewritten to underscores). `frontmatter-fields-a.md` §`tools` gives
the same justification for both — theta identifiers must be lowercase-first
identifier-shaped — and registers `theta/load/invalid-tool-rename` for the
override. The derived default is not checked.

The discovery stem regex `^[a-z0-9][a-z0-9_-]*$`
(`docs/spec_topics/discovery/discovery-sources.md:74`) admits a leading digit, so
`2fast.theta` is a fully valid, registrable theta file. Listing it in `tools:`
mints the callable name `2fast`. The theta registers with zero diagnostics; a
code-side call of that callable is a lexical impossibility, and the only signal
the author gets is `theta/parse/unsupported-feature: unsupported syntactic
feature: 2fast` pointing at their own call site.

## Reproduction

Offline, against the shipped composition root
(`tests/production-tools-load-resolution.test.ts` harness). Planted under
`<workspace>/.pi/theta/`:

`2fast.theta` (a valid slash name — registers as `/2fast`):

```theta
---
mode: subagent
---
@`fast`
```

`digitcallee.theta` — declares it as a callable, never calls it:

```theta
---
mode: subagent
tools:
  - ./2fast.theta
---
@`hi`
```

`digitcall.theta` — the same declaration plus a code-side call:

```theta
---
mode: subagent
tools:
  - ./2fast.theta
---
let r = 2fast()?
r
```

Observed:

```
REGISTERED: [… "2fast", … "digitcallee", …]        ← digitcall absent
digitcall.theta:6:9:  theta/parse/unsupported-feature: unsupported syntactic feature: 2fast
digitcall.theta:6:16: theta/parse/unsupported-feature: unsupported syntactic feature: stray '?' in statement position
```

`digitcallee` registers clean: the callable-set entry `2fast` is admitted with no
load diagnostic. `digitcall` is un-registered by two parse diagnostics that
describe the author's call site as unsupported syntax, never mentioning the
`tools:` entry that created the unspellable name.

Control: the same file renamed via `as` to a bad shape —
`  - ./2fast.theta as 2fast` — is rejected at load with
`theta/load/invalid-tool-rename` ("rename target must be lowercase-first; got
'2fast'"), pinned green by `tests/production-tools-load-resolution.test.ts`
(`badrename` cell, with `as BadName`). The identical final name is refused
through one source and admitted through the other.

## Expected behaviour

- `docs/spec_topics/frontmatter/frontmatter-fields-a.md:84`: "For a `.theta`
  path, the default name is the file's basename without the `.theta` extension,
  with **hyphens replaced by underscores** (`./code-review.theta` →
  `code_review`). The remap exists because theta-file naming convention favours
  hyphens while **theta identifiers must be lowercase-first identifier-shaped**."
  The rule the remap exists to satisfy is stated for the derived name, on the
  derived name's own bullet.
- `:85`: "The override target must obey theta's lowercase-first identifier rule
  (`./summarise.theta as MyTool` is `theta/load/invalid-tool-rename`)." — the
  same rule, enforced.
- `:83` (the bullet heading both): "Each entry is exposed under a single name in
  the theta's **top-level scope** (and to the model as a tool of the same
  name)." A name that cannot be written as an identifier is not exposed in the
  top-level scope; `docs/spec_topics/lexical.md` §Identifiers makes the
  lowercase-first identifier the only spelling of a binding.
- `docs/spec_topics/tool-calls.md`, opening: theta code calls a callable "via
  the bare-identifier form `<name>(args)`, where `<name>` is an entry in the
  theta's *callable set*". For `2fast` there is no such bare identifier.

## Actual behaviour / root cause

`src/parser/callable-set.ts:350`:

```ts
function thetaDefaultName(thetaPath: string): string {
  const basename = thetaPath.slice(thetaPath.lastIndexOf("/") + 1);
  const stem = basename.endsWith(".theta") ? basename.slice(0, -".theta".length) : basename;
  return stem.replace(/-/g, "_");
}
```

The transform is unconditional and its output is never tested. Sixteen lines
earlier the sibling source is tested:

```ts
if (parsed.rename !== undefined && !isLowercaseFirstIdentifier(parsed.rename)) {  // :183
  diagnostics.push({ severity: "error", code: "theta/load/invalid-tool-rename", … });
  continue;
}
…
const name = parsed.rename ?? resolution.defaultName;                             // :200
```

`isLowercaseFirstIdentifier` (`:370`, `/^[a-z_][A-Za-z0-9_]*$/`) is applied to
`parsed.rename` only. Both values then flow into the same `entries` map key, so
the frozen snapshot — `presentedCallableNames`
(`src/extension/production-theta-producer.ts:3595`) returns its keys as the
environment's arm-4 callable registry — carries a name arm 4 can never match.

Reachable inputs are bounded by the discovery stem regex only when the callee is
itself discovered. `^[a-z0-9][a-z0-9_-]*$` admits `2fast`, `9`, `0abc` — every
digit-leading stem. (Hyphen-to-underscore rewriting means a discovery-valid stem
can produce nothing else invalid: uppercase and dots are already refused by
`theta/load/invalid-slash-name`.) The digit-leading class is therefore the
reachable one, and it is not exotic: version- or step-numbered file names
(`2-classify.theta` → `2_classify`) are a natural naming style.

## Why it matters

- **A declared capability is silently half-present.** The entry is in the frozen
  callable set, so it is offered to the model and counts for collision
  detection, but theta code cannot call it. The author sees a registered theta
  and assumes a working callable.
- **The diagnostic the author does get blames the wrong file.** `unsupported
  syntactic feature: 2fast` at the call site says nothing about `tools:`; the
  fix (rename the callee file, or add `as`) is not derivable from it.
- **The two name sources disagree about the same final name.** `./2fast.theta`
  is admitted; `./2fast.theta as 2fast` is refused. Whichever behaviour is
  intended, one of them is wrong.

## Non-goals

- Changing the discovery stem regex (`^[a-z0-9][a-z0-9_-]*$`) — that governs
  slash names, is separately specified, and tightening it would un-register
  existing files for an unrelated reason.
- The hyphen→underscore rewrite itself, which is correct and load-bearing.
- Pi-tool entries: their default name is the registry name verbatim, so the same
  gap exists in principle (a host tool registered under a non-identifier name),
  but no such name is reachable through this repo's registry snapshot, and
  `isBareIdentifier` (`:361`) already routes a non-identifier `tools:` spec to
  the `.theta`-path arm.

## Fix

Recommended: apply the existing predicate to the merged name rather than to one
of its sources. At `src/parser/callable-set.ts:200`, test
`isLowercaseFirstIdentifier(name)` and emit `theta/load/invalid-tool-rename`'s
sibling for the derived case.

Two options for the diagnostic, with the tradeoff:

1. **Reuse `theta/load/invalid-tool-rename`.** No registry change, but its
   registered Message (`'as <name>' rename target must be lowercase-first; got
   '<name>'`) and its registered Trigger ("`as <name>` target is not
   theta-identifier-shaped") both name a rename that the author did not write —
   a diagnostic that lies about its own trigger, and a message the author cannot
   act on.
2. **Add `theta/load/invalid-derived-tool-name`** (registry row in
   `code-registry-load.md` + the `docs/reference/diagnostics.md` mirror), whose
   message names the entry path, the derived name, and the `as` escape hatch.
   Costs a spec addition; is the only option that produces an actionable
   message.

Option 2 is recommended. Either way the check must run before the
collision test at `:203` so a derived-name rejection is not masked by a
collision, and `tests/production-tools-load-resolution.test.ts` needs the paired
cell (`./2fast.theta` un-registers; `./2fast.theta as fast` registers) so the
gate cannot silently regress.

## Fix (0.63.0)

**Route: §Fix Option 2**, the recommended one. The existing predicate
`isLowercaseFirstIdentifier` is applied to the MERGED name rather than to one of
its sources, and the derived case gets its own registered code. Option 1 (reuse
`theta/load/invalid-tool-rename`) was not taken for the reason §Fix gives: that
row's registered *Message* and *Trigger* both name a rename the author did not
write, so it would be a diagnostic that lies about its own trigger. The same
reasoning drove two decisions the route did not spell out and this record pins:
the check is guarded on `parsed.rename === undefined` (an `as` target has already
been judged and `continue`d out above, so the derived-case message can never
narrate an author-written rename), and it is guarded on the resolution's
`.theta` arm (`resolution.callable.kind === "theta"`) because the new row's
*Trigger*, *Hint* and *Message* all speak of a basename derivation that the
Pi-tool arm — whose default name is the registry name verbatim — never performs.

### What shipped

- `src/parser/callable-set.ts` — `resolveCallableSet` gained the derived-name
  check at the merge point (`const name = parsed.rename ?? resolution.defaultName;`),
  raising `theta/load/invalid-derived-tool-name`. **Position: immediately after
  the merge and BEFORE the name-collision test**, which is §Fix's binding
  ordering constraint — cell (C3) pins it with a `reservedNames` entry that would
  otherwise mask the rejection as a collision. The arm-kind discriminant is read
  off the `EntryResolution` the resolver already computed, never re-derived from
  `parsed.spec`, so it cannot fall out of lock-step with the arm split
  `resolveEntry` owns (bug 0069 §Fix constraint 5's hazard class). Three
  rejection inventories (module header, `resolveCallableSet`'s doc comment,
  `CallableSetResult.registered`'s doc comment) and
  `isLowercaseFirstIdentifier`'s doc comment were brought into step.
- `src/extension/production-composition.ts` — the new code added to
  `preEvalCauseOf`'s ERR-6 `tools-resolution` batch, so the honest
  code-to-pre-eval-cause mapping that function documents does not classify a
  `tools:`-resolution rejection as a generic frontmatter one. Routing-neutral by
  that function's own contract.
- `docs/spec_topics/diagnostics/code-registry-load.md` — new row for
  `theta/load/invalid-derived-tool-name` (E, load), immediately after
  `theta/load/invalid-tool-rename`, the sibling whose predicate it shares.
  *Trigger* prose is spec vocabulary only. *Message*:
  `'tools:' entry '<path>' derives the default name '<value>', which must be lowercase-first; rename the file or add an 'as' clause`.
- `docs/reference/diagnostics.md` — the mirror row, same relative position,
  *Message* byte-identical.
- `docs/spec_topics/diagnostics/placeholder-rendering-b.md` — **placeholder
  sub-rules reused, none introduced, none retired, none moved between
  categories**, so `placeholder-rendering-a.md` §Closure and its GOV-7 / GOV-8
  posture are untouched beyond one enumeration. `<path>` binds the entry's path
  literal under category 5's existing `<path>` rule (no edit needed — the same
  rule `theta/load/unresolvable-theta-path` and `theta/load/prompt-mode-callable`
  use for this exact value). `<value>` binds the derived name under §7's
  **parse-time literal-value** sub-rule, the same sub-rule
  `theta/load/unknown-mode-value` and `theta/load/malformed-tool-entry` use; the
  code was added to that bullet's row enumeration. One row-scoped clause was
  added to the same bullet because the bound value is a *derived* name rather
  than a source substring (`./2-fast.theta` derives `2_fast`, which appears
  nowhere in the source) and renders unquoted regardless of identifier shape,
  exactly as the bullet's pre-existing unquoted-YAML-scalar exception already
  prescribes for a scalar with no enclosing source quoting.
- `docs/spec_topics/frontmatter/frontmatter-fields-a.md` §`tools` — the `.theta`
  derived-default bullet, which already gave the lowercase-first rule as the
  reason the hyphen remap exists, now names the rejection and the ordering.
- `docs/reference/frontmatter.md` — the same statement in the "Two entry kinds"
  mirror bullet.
- `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md` — the code
  added to the §`tools` rejection-family enumeration, adjacent to
  `theta/load/invalid-tool-rename`.

### Witness inventory

- `tests/tools-derived-name-shape.test.ts` — **new**, 19 cells.
  **(A)** the registry row, read through `parseRegistry` / `registryMessage`
  (`tools/code-registry/index.js`) so every message assertion in the file is
  sourced from the *Message* column rather than copied prose (DIAG-4).
  **(B0–B5)** the production-load matrix: real `mkdtempSync` workspace, planted
  `.pi/theta/`, `discoverAndComposeFixtures(pi, ctx)` with `ctx.cwd = workspace`,
  a `ctx.ui.notify` collector, `.pi/settings.json` = `{}`. `./2fast.theta`
  un-registers and notifies; `./2-fast.theta` un-registers naming the
  post-rewrite `2_fast`; `./2fast.theta as fast` and `./code-review.theta` →
  `code_review` still register; `- read as BadName` keeps
  `theta/load/invalid-tool-rename` and is not reclassified. `B0` is a loud
  precondition guard that cannot be satisfied by an empty discovery walk.
  **(C1–C7)** resolver-direct: the rejection and its exact message; the `as`
  override resolving; **(C3)** the ordering pin against
  `theta/load/tool-name-collision`; **(C4)** the sibling-precedence pin
  (`./2fast.theta as BadName` stays `invalid-tool-rename`); the shared
  `code_review` derivation; **(C6/C6a)** the Pi-tool arm — `read` unaffected, and
  a non-lowercase-first registry name (`WebSearch`) resolving verbatim with no
  claim raised, which is the only cell where the `.theta`-arm conjunct is
  load-bearing; **(C7)** the dotted stem `./foo.bar.theta` → `foo.bar`.
- `tests/production-tools-load-resolution.test.ts` — **additive only** (72
  insertions, 0 deletions), under §Fix's explicit pre-authorisation: the mandated
  paired cell (`./2fast.theta` un-registers; `./2fast.theta as fast` registers)
  plus its notification cell, three planted thetas and one `MSG` entry. No
  existing cell, planted theta or assertion was weakened, reworded or deleted.
- `tests/live/live-production-acceptance.test.ts` — **additive only** (113
  insertions, 0 deletions): one H8a cell driving the same registration observable
  through the real `session_start` → `resources_discover` →
  `composeExtensionInstance` → `discoverAndComposeFixtures` → `resolveCallableSet`
  path against a live host. Added because no live fixture anywhere under
  `tests/live/**` planted a `.theta`-path `tools:` entry — every live `tools:`
  occurrence is the bare Pi-tool token `read`, which the new arm exempts, so the
  fixed arm had no live reach. Registration-only, so it spends zero tokens;
  `requireLiveProvider()` fails loudly on a missing provider.

### Gates

```
npx vitest run tests/tools-derived-name-shape.test.ts tests/production-tools-load-resolution.test.ts
  BEFORE (HEAD 99b65438):  Test Files 2 failed (2) / Tests 11 failed | 22 passed (33)
  AFTER:                   Test Files 2 passed (2) / Tests 34 passed (34)

npm test                 -> Test Files 254 passed (254) / Tests 3596 passed (3596)
npx tsc -p tsconfig.json --noEmit  -> zero `error TS`
npm run lint             -> eslint "src/**/*.ts" clean

npx vitest run --config config/vitest/vitest.live.config.ts tests/live/live-production-acceptance.test.ts
  -> Test Files 1 passed (1) / Tests 8 passed (8)          (31.1 s)
npx vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance/
  -> Test Files 2 passed (2) / Tests 11 passed (11)        (~61 s)
```

Every pre-fix red was the bug's own symptom — the theta present in
`Registered:`, the absent notification, `diagnostics: []` at the resolver seam,
or `theta/load/tool-name-collision` firing in the new code's place — never a
compile error and never a harness throw. No 0064 / 0065 live signature appeared
and no H9a area stalled.

### `tests/fixtures/h7a/permitted-codes.json`: DO NOT APPEND

Decided by the real H9a run, not by assumption. The only `tools:`-carrying
fixture in H9a's reach (`tests/live/acceptance/fixtures/acc-code-tool-loop.theta`)
uses the bare Pi-tool token `- read`, which the `.theta`-arm guard exempts;
every other acceptance fixture carries no `tools:` field. All 11 H9a areas
passed `assertCodesSubsetOfPermitted` and `assertStderrClean` with the new code
absent from every capture. The file is unedited.

### Stale-citation map (bug 0069 rewrote this region at the immediately preceding commit)

This report's citations were taken at `0.52.0` (`d06daae3`); bug 0069 shipped at
`0.62.0` (`99b65438`) and rewrote `resolveCallableSet`'s per-entry loop. Every
anchor was re-verified at the fix baseline and the reproduction observables
re-derived with a scratch probe (written, run, deleted) before any assertion was
pinned:

| Cited (0.52.0) | Actual at 99b65438 |
|---|---|
| `callable-set.ts:350–356` (`thetaDefaultName`) | `:387–:391` |
| `callable-set.ts:183–190` (the `as`-target check) | `:202–:210` |
| `callable-set.ts:200` (the merge point) | `:219` |
| `callable-set.ts:203` (the collision test) | `:223` |
| `callable-set.ts:370` (`isLowercaseFirstIdentifier`) | `:407` |
| `callable-set.ts:361` (`isBareIdentifier`) | `:398` |
| `production-theta-producer.ts:3595` (`presentedCallableNames`) | `:3600` |
| `frontmatter-fields-a.md:83` (the §-scope bullet) | `:81` |
| `frontmatter-fields-a.md:84–86` | exact |
| `discovery-walk.ts:76`, `discovery-sources.md:74` | exact |

Also rebased against 0069, per its handoff note: `parseEntry` / `interface
ParsedEntry` are gone, replaced by the exported `parseToolsEntry` /
`ToolsEntryParse`; the per-entry loop's leading `theta/load/malformed-tool-entry`
arm precedes the `as`-target check, and the derived-name check belongs after
`resolveEntry` returns `defaultName` rather than inside that block — which is
where it landed.

The re-derived pre-fix baseline reproduced every claim in §Reproduction exactly:
`digitcallee` registered with zero load diagnostics; `digitcall` was
un-registered by precisely the two `theta/parse/unsupported-feature` diagnostics
at `6:9` and `6:16` quoted there; the `badrename` control fired
`theta/load/invalid-tool-rename`. Resolver-direct:

```
./2fast.theta                        registered=true  keys=["2fast"]      diags=[]
./2fast.theta as fast                registered=true  keys=["fast"]       diags=[]
./2-fast.theta                       registered=true  keys=["2_fast"]     diags=[]
./foo.bar.theta                      registered=true  keys=["foo.bar"]    diags=[]
./code-review.theta                  registered=true  keys=["code_review"] diags=[]
./2fast.theta + reservedNames=[2fast] registered=false diags=[theta/load/tool-name-collision]
```

### Review rounds

3 review rounds, 2 fixer rounds.

- **Round 1 (`bug-fix-reviewer`): 4 defects.** (i) `correctness`/`fidelity` — the
  new arm also fired on the **Pi-tool** arm, reachable via an uppercase-first
  bare identifier (`tools: WebSearch`), where the row's *Trigger*, *Hint* and
  *Message* are all false and where §Non-goals puts Pi-tool entries; fixed by the
  `resolution.callable.kind === "theta"` conjunct. (ii) `spec` — the new §7
  clause said the derived value renders "by the same bare/quoted predicate",
  which would demand `'"2fast"'` for every digit-leading or dotted name and make
  the shipped renderer and both green witnesses non-conformant; rewritten to the
  unquoted rendering. (iii) `prose` — four born-stale `path:line` anchors in the
  witness header (the same class as 0069's own round-1 defect), including a
  stem-regex citation to `discovery-walk.ts:76`, which holds the
  `INVALID_SLASH_NAME` constant, not the regex (`:82`). (iv) `prose` — the
  witness header's defect narrative and red inventory were present-tense and
  false in the committed tree. Plus a fifth, folded in: a third rejection
  enumeration in `callable-set.ts` left behind.
- **Fixer round 1 (`bug-fix-fixer`)** discharged all five, none refused; the
  eight `callable-set.ts` line anchors were converted to symbol citations, which
  cannot drift. One orchestrator tightening followed:
  `isLowercaseFirstIdentifier`'s doc comment now scopes the derived side to
  `.theta` entries, matching the post-fix enforcement and
  `frontmatter-fields-a.md:83–85`.
- **Round 2 (`bug-fix-reviewer-fast`): CLEAN**, 3 residuals. Two were closed
  because they were gaps in this fix's own witness coverage: the
  `.theta`-arm conjunct had no cell that could red on its removal, and a sibling
  present-tense comment contradicted its own next sentence.
- **Fixer round 2 (`bug-fix-fixer-light`)** added cell (C6a) and retensed the
  comment; it proved (C6a) reds on the conjunct's removal and restored the source
  byte-exact (blob hash identical before and after).
- **Round 3 (`bug-fix-reviewer-fast`): CLEAN, 0 defects**, confirming that delta
  and re-verifying the additive-only constraint (`git diff --numstat` → `72 0`)
  and every remaining anchor.

### Verification

`bug-fix-verifier` → **PASS**, all four obligations discharged with quoted
evidence; re-confirmed independently.

1. **The witnesses genuinely witness.** Three neutralisations by targeted byte
   edit, alone and composed — never `git stash`, never a path checkout. Removing
   the whole arm → 10 red, every one the bug's symptom. Removing only the
   `.theta`-arm conjunct → exactly (C6a), on `expect(r.registered).toBe(true)`.
   Removing the registry row → exactly (A), naming the missing code, which proves
   the DIAG-4 sourcing. Arm + row together → 11 red, the exact union, so the
   seams compose additively with no masking. All files restored byte-exact and
   blob-hash verified (`callable-set.ts` `1c5a9036…`, `code-registry-load.md`
   `d5397453…`), re-hashed independently afterwards.
2. **Full default suite green** — 254 files / 3596 tests; typecheck and lint
   clean. Re-run independently four times across the fix.
3. **Live end-to-end over the fixed path** — H8a 8/8 (including the new cell, and
   re-run independently) and H9a 11/11, both for real. The new cell's red
   direction was proven under the same neutralisation and the source restored
   byte-exact.
4. **Permitted-codes decided by the run** — do not append; the file is unedited.

### Residuals

All recorded for filing by the parent session; no new bug documents were created
here.

1. **The `parsed.rename === undefined` conjunct is an equivalent mutant.** Given
   the `as`-target check's `continue` above, a name reaching the derived-name arm
   with a rename present has already passed the same predicate, so removing that
   conjunct cannot change any outcome and no test can witness its removal. It is
   retained deliberately — it keeps the diagnostic's claim about its own trigger
   true independently of a non-local invariant, and the code comment says so —
   but a future refactor must not read (C6a)'s coverage as extending to it.
2. **`presentedCallableNames`' snapshot-absent fallback does not replicate the
   check.** `src/extension/production-theta-producer.ts` derives presented names
   from `parseToolsEntry` without the shape test when `theta.callableSet` is
   absent, so a harness-only fixture with a `./2fast.theta` entry and no snapshot
   would still expose `2fast`. Pre-existing and consistent with that fallback
   already skipping the rename-validity and unknown-tool checks; no reachable
   production path (production always takes the snapshot arm) and no test
   exercises it. Same family as bug 0106.
3. **An uppercase-first host Pi tool name still mints an unspellable callable.**
   `tools: WebSearch` resolves and binds `WebSearch` with no diagnostic — the
   in-principle gap §Non-goals sketched, now pinned as deliberate by cell (C6a).
   Reachability depends on a host or extension registering a non-lowercase-first
   tool name; none exists in this repo's registry snapshot.
4. **`preEvalCauseOf`'s ERR-6 batch still omits two `tools:` codes.**
   `theta/load/malformed-tool-entry` (bug 0069's) and
   `theta/load/unresolvable-theta-path` (older) fall through to the ERR-3
   frontmatter default, which the function's own doc comment calls an honest
   mapping. Not fixed here: neither code is this bug's.
5. **`docs/spec_topics/functions.md` FN-7's reuse enumeration is incomplete.** It
   lists the `tools:` diagnostics a `subagent fn`'s `with { tools: … }` clause
   reuses and omits both `theta/load/malformed-tool-entry` (since 0069) and
   `theta/load/invalid-derived-tool-name`. Left alone rather than half-corrected.
6. **This fix's fixture insertion shifted line anchors in a sibling bug report.**
   `docs/bugs/0106-tools-entry-grammar-derivations-outside-lockstep.md` cites
   `tests/production-tools-load-resolution.test.ts:125–136` as the
   `callee-has-errors` cells; those fixtures now sit ~29 lines lower. 0106 is
   sibling-owned and was not edited.

### Where this report turned out to be understated

§Actual behaviour concludes "The digit-leading class is therefore the reachable
one", reasoning that "uppercase and dots are already refused by
`theta/load/invalid-slash-name`". That holds only for a callee that is itself
*discovered*. A `tools:` `.theta` entry is resolved as a path literal against the
parse cache and never consults the discovery stem regex, so `./foo.bar.theta` →
`foo.bar` and `./Foo.theta` → `Foo` are reachable through `tools:` even though
neither file can register a slash name. Probe evidence: with `foo.bar.theta`
planted, the caller registered clean under the key `foo.bar` while the paired
negative control `./nosuch.bar.theta` fired
`theta/load/unresolvable-theta-path`, proving the resolution arm was genuinely
live. The route is unaffected — a predicate on the merged name covers every one
of these classes — and cell (C7) pins the dotted case. Everything else in this
report reproduced exactly.

### Pinned dispositions / non-goals

Unchanged and untouched: the discovery stem regex `^[a-z0-9][a-z0-9_-]*$`, the
hyphen→underscore rewrite, and the Pi-tool arm (residual 3). `thetaDefaultName`,
`isBareIdentifier`, `parseToolsEntry`, `resolveEntry` and `splitEntries` are
byte-unchanged.

## Provenance

- Spec measured against:
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:83–86` (§`tools` naming
  rules), `docs/spec_topics/lexical.md` §Identifiers,
  `docs/spec_topics/discovery/discovery-sources.md:74` (Filename validity, stem
  regex), `docs/spec_topics/tool-calls.md` (bare-identifier call form),
  `docs/spec_topics/diagnostics/code-registry-load.md`
  (`theta/load/invalid-tool-rename`, `theta/load/invalid-slash-name` rows).
- Implementation: `src/parser/callable-set.ts` (`thetaDefaultName`,
  `isLowercaseFirstIdentifier`, `resolveCallableSet`),
  `src/extension/production-theta-producer.ts:3595` (`presentedCallableNames`),
  `src/discovery/discovery-walk.ts:76`.
- Evidence: offline production-load matrix (this report §Reproduction) run at
  `d06daae3` via a scratch vitest on the
  `tests/production-tools-load-resolution.test.ts` harness; scratch deleted.
