# Bug 0070 — A `.theta` entry's derived default callable name is never checked against the lowercase-first identifier rule the `as` target is checked against: `./2fast.theta` admits a callable named `2fast`, which no theta expression can spell

- **Status:** open.
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
