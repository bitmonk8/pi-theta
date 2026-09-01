# Bug 0297 — A `bind_context:` whose value is a YAML sequence or mapping registers the theta silently with the default `none`, where the registry row refuses registration for a present value that "is neither `none` nor `session`" — and the sibling `bind_model:` non-scalar falls back to `theta.binderModel` on the same silent path

- **Status:** fixed (0.330.0).
- **Sev/Diff estimate:** S3/D1 — silent permissive acceptance: the load-time
  error the spec prescribes does not fire, the theta registers, and the
  binder runs with `none` (no session context) against an author who
  declared a `bind_context` value. No wrong value reaches the model beyond
  the missing context block, and the scalar spellings are enforced — the
  hole is the node-kind class only. D1 because the value node is in hand at
  the `bind_context` arm and the fix mirrors bug 0104's one-arm refusal.
- **Kind:** defect. `docs/spec_topics/frontmatter/frontmatter-fields-a.md:41`
  (the `bind_context` row): "A present value other than `none` or `session`
  (including non-string scalars) is the separate
  `theta/load/unknown-bind-context-value` load-time error and the theta is
  not registered — mirroring the `mode:` recognised-key / unrecognised-value
  split." `docs/spec_topics/diagnostics/code-registry-load.md:25` pins the
  *Trigger*: "`bind_context:` is present but its value is neither `none` nor
  `session` (non-string scalars included; no truth-coercion and no separate
  type-mismatch code). The theta is not registered." A block-sequence value
  is a present value that is neither; the implementation registers the theta
  with zero diagnostics. (The parentheticals name non-string *scalars*
  explicitly; the operative clause — "a present value other than `none` or
  `session`" — is not scoped to scalars, and no sentence anywhere gives
  non-scalar nodes a silent-default disposition.)
- **Related:**
  - [0104](./0104-tools-field-nonscalar-value-loads-empty-callable-set.md)
    — fixed (0.127.0). The identical node-kind hole at `tools:`, closed with
    `theta/load/malformed-tools-field` at the field arm. This report is the
    same hole at `bind_context:` (and, one notch weaker, `bind_model:`).
  - The `mode:` face of the same field-loop seam is filed separately
    (candidate 01 in this batch): there the collapse produces a lying
    `missing-mode`; here it produces silence.
- **Affected** (verified at bc52da38, v0.287.0):
  - `src/parser/frontmatter.ts:1128–1131` — the `bind_context` arm:
    `bindContextValue = isScalar(item.value) ? String(item.value.value) :
    undefined`. A non-scalar node records `undefined` — the absent-field
    value.
  - `src/parser/frontmatter.ts:1331–1341` — the unknown-bind-context-value
    arm, gated on `bindContextValue !== undefined`, unreachable for the
    non-scalar class.
  - `src/parser/frontmatter.ts:1083–1085` — the `bind_model` arm, same
    shape: a non-scalar `bind_model:` records `undefined` and the load
    falls back to the `theta.binderModel` setting silently (the fallback
    chain the spec reserves for an ABSENT `bind_model:`,
    `frontmatter-fields-a.md:40`).
- **Observed at:** 0.287.0 (bc52da38). Offline, deterministic: scratch vitest
  over `parseThetaDocument` via `tests/helpers/e2e-s1.ts` `parseDoc` (run and
  deleted).

## Summary

`bind_context:` mirrors `mode:`'s recognised-key / unrecognised-value split:
`none` and `session` are the two recognised values, and everything else
present is a load error that blocks registration. The implementation
enforces that split only over scalar nodes. A sequence or mapping value —
`bind_context: [session]`, `bind_context:` over `  - session` — records
`undefined`, skips the unknown-value arm, and the theta registers with zero
diagnostics and the default `none`: the binder runs with no caller-session
context on a theta whose author declared one.

`bind_model:` has the same node-kind hole with a weaker spec anchor: a
non-scalar `bind_model:` silently takes the `theta.binderModel` fallback the
spec assigns to the absent field.

Scalar controls hold: `bind_context: banana` →
`theta/load/unknown-bind-context-value` (E, not registered);
`bind_context:` bare (null scalar) → the same code naming `'null'`.

## Reproduction

Each row is one file (`---` fences, body `let x = 1`), parsed through
`parseThetaDocument` with the production parse deps. "registered" is
`frontmatter !== null` on the returned document (the production gate at
`src/extension/production-composition.ts` refuses on any error-severity
diagnostic; zero diagnostics registers).

| frontmatter | diagnostics | registered | effective bindContext |
|---|---|---|---|
| `mode: prompt` + `bind_context: [session]` + two-string `params:` | `[]` | yes | absent → `none` |
| `mode: prompt` + `bind_context:` over `  - session` | `[]` | yes | absent → `none` |
| `mode: prompt` + `bind_context: banana` (control) | `error theta/load/unknown-bind-context-value :: unknown 'bind_context:' value 'banana'; expected 'none' or 'session'` | no | — |
| `mode: prompt` + `bind_model: [x]` + two-string `params:` | `[]` | yes | `bindModel` absent → settings fallback |

## Expected behaviour

- `frontmatter-fields-a.md:41`: a present `bind_context:` value other than
  `none` or `session` is `theta/load/unknown-bind-context-value` and the
  theta is not registered.
- `code-registry-load.md:25` (*Trigger*): "present but its value is neither
  `none` nor `session` … The theta is not registered."
- For `bind_model:`: `frontmatter-fields-a.md:40` routes a PRESENT value
  through the binder-model parse rule (a string match); the settings
  fallback is the ABSENT-field behaviour. No sentence admits a non-scalar
  `bind_model:` as equivalent to absent.

## Actual behaviour / root cause

The field loop's scalar-only narrowing
(`src/parser/frontmatter.ts:1128–1131`, `:1083–1085`) maps every non-scalar
node to `undefined`, the same value an absent key produces, before any
validation arm runs. The unknown-value arm (`:1331`) and the binder-model
resolution both read only the narrowed string, so the present-but-non-scalar
class is invisible to them. This is byte-for-byte the mechanism bug 0104
reported at `tools:` ("a `tools:` field whose VALUE is a YAML mapping … is
treated as an absent field"), whose fix refused the shape at the arm; the
sibling arms were left as they were.

## Why it matters

- The author declared a binder-affecting value and the load both ignores it
  and reports nothing — the exact "silent narrowing of author intent"
  disposition 0104's fix record establishes for this field family.
- `bind_context: session` is a behavioural switch (the binder gains a
  session-context block, binder.md §Binder context); dropping it changes
  what the binder model sees with no observable trace at any severity.
- The registry row's own *Trigger* wording ("non-string scalars included; no
  truth-coercion and no separate type-mismatch code") shows the row was
  written to be total over bad values; the node-kind class silently escapes
  it.

## Non-goals

- The `mode:` face (lying `missing-mode`) — candidate 01, its own spec
  sentence.
- `description:` / `system:` non-scalar silence — candidates 03/04 territory
  (different consumers, different impact).
- `bind_context: session` on `mode: subagent` — the existing
  `theta/parse/bind-context-session-on-subagent` warning
  (`src/parser/frontmatter.ts:1236–1244`) is out of scope and unaffected.
- Truth-coercion of sequence contents (`[session]` ≠ `session`): no coercion
  is proposed; the registry row explicitly forbids it.

## Fix

At the `bind_context` arm, record presence (as the `model:` arm does with
`modelPresent`, `src/parser/frontmatter.ts:1076–1081`) and route a present
non-scalar node to `theta/load/unknown-bind-context-value`, rendering
`<value>` boundedly (JSON kind token, or the line-break-normalised source
slice — the `malformed-tool-entry` precedent). Same for `bind_model:` →
`theta/load/binder-model-unresolved` or a shape refusal; if the
`bind_model:` disposition is judged spec-silent, record it as such in the
same commit rather than leaving the silent fallback. Constraints: scalar
rows unchanged (the three controls above); theta not registered on the
refusal; message single-line.

## Provenance

Fresh find. Probed at bc52da38 with a scratch vitest over `parseDoc` (rows
above; deleted). Spec read: `frontmatter-fields-a.md` rows for
`bind_context` / `bind_model`; `code-registry-load.md:25`;
`binder/binder-model-and-context.md` §Binder context (consumer side).
Prior-bug sweep: 0104/0206 (the `tools:` precedent), 0064/0178 (binder-model
family — different subjects), README index for `bind_context` (no prior
report).

## Fix (0.330.0)

- What shipped:
  - `src/parser/frontmatter.ts` — the `bind_context` arm now records
    `bindContextPresent` for any present `bind_context:` and, for a non-scalar
    value node, its bounded kind token via the new
    `renderNonScalarBindContextKind` helper (null-value-node→`null`,
    sequence→`array`, mapping→`object`, alias→`object` fallback), mirroring
    0296's `mode:` Route-1 mechanism; the unknown-bind-context-value arm gates
    on `bindContextPresent` (not `bindContextValue !== undefined`) and renders
    `<value>` as the scalar bytes (line-break-normalised) or the recorded kind
    token — so a present non-scalar `bind_context:` draws
    `theta/load/unknown-bind-context-value` and the theta is not registered.
    The `bind_model` arm now records a `bindModelUnresolvable` marker (no
    fabricated string) for a present non-scalar value, carried on
    `ParsedFrontmatter.bindModelUnresolvable`. No new code minted; no registry
    text edited.
  - `src/binder/binder-model.ts` — `BinderModelResolutionInput` gains
    `bindModelUnresolvable?: boolean`; `resolveChainReference` returns `null`
    immediately when it is set, before the `bind_model:` → `theta.binderModel`
    settings fallback — so a present non-scalar `bind_model:` is
    present-but-unresolvable (routes through the EXISTING
    `theta/load/binder-model-unresolved` machinery as an unresolvable declared
    string) instead of silently taking the settings fallback the spec reserves
    for the ABSENT field.
  - `src/extension/production-composition.ts` — threads
    `frontmatter.bindModelUnresolvable` into the single production
    `resolveBinderModel({...})` call.
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md` — EXTENDED the
    one shared except-clause 0296 added on the Parse-time literal-value
    (`<value>`) bullet so it names BOTH `theta/load/unknown-mode-value` and
    `theta/load/unknown-bind-context-value` (bugs 0296/0297), one clause, same
    kind-token rendering rule. No second parallel clause; the registry row
    (`code-registry-load.md`) is untouched.
  - `tests/b0297-bind-context-bind-model-nonscalar.test.ts` — offline witness
    (12 cells): bind_context flow-seq/block-seq→`array`, flow-map/alias→`object`,
    `? bind_context` no-value-node→`null` (all refused, not registered);
    controls `bind_context: banana`/bare-`null`/`session`; bind_model non-scalar
    non-bypass→`binder-model-unresolved`, bypass control, scalar control; a
    DIAG-4 anchor on the reused registry Message template.
  - `tests/b0297-bind-model-nonscalar-production-load.test.ts` — a
    composition-level offline witness (3 cells) driving the real
    `discoverAndComposeFixtures` compose pass over a planted workspace with a
    resolvable `theta.binderModel`, so the production `bindModelUnresolvable`
    spread has a red path (dropping it reverts the offender to the silent
    settings fallback).
  - `tests/live/acceptance/b0297live-bind-context-nonscalar-load-refusal.test.ts`
    — H9a live acceptance: a non-scalar-`bind_context:` offender refuses at load
    (observed via `invoke`→`Err`→`REFUSED`) while a scalar-`bind_context:`
    control registers and drives (`877`), through the real `pi -p`. Both
    fixtures are `mode: subagent` (see Residuals 1).
- Gates:
  - Witness: `npx vitest run tests/b0297-bind-context-bind-model-nonscalar.test.ts`
    → 12/12; `npx vitest run tests/b0297-bind-model-nonscalar-production-load.test.ts`
    → 3/3. Red-before/green-after proven by the verifier via copy-based revert
    (no git stash/checkout): reverting the `bind_context` arm reds cells A-D +
    `? bind_context` with `got codes []`; dropping the production
    `bindModelUnresolvable` spread reds the production-load offender (registers
    via settings fallback); both restorations byte-identical (`git hash-object`
    match).
  - Full suite: `npm test` → 512 files / 9811 tests pass.
  - Typecheck: `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) — clean.
  - Lint: `npm run lint` (`eslint "src/**/*.ts"`) — clean.
  - Live: `b0297live-bind-context-nonscalar-load-refusal` → 1/1 pass under the
    shared lock (`C:/UnitySrc/pi-theta/.pi/tmp/fix-open-bugs/live.lock`, VERBATIM
    protocol) — the offender refuses (`REFUSED`) and the control drives (`877`)
    through the real `pi -p`.
- Review: 2 rounds. R1 (`bug-fix-reviewer`) — CLEAN on correctness/fidelity/spec;
    two [test] findings: F1 (the production `bindModelUnresolvable` spread had no
    red path — cell H hand-built the resolver input) and F2 (the `null` branch of
    `renderNonScalarBindContextKind`, `? bind_context`, unwitnessed). Both closed
    by adding tests only (new production-load witness + one `? bind_context`
    cell); no src change. R2 (`bug-fix-reviewer-fast`, allowed because R1 raised
    no correctness/fidelity/spec) — CLEAN, no escalation; confirmed F1 reds on a
    dropped production spread and F2 exercises the null branch non-vacuously.
- Verification: `bug-fix-verifier` SOLID (offline obligations) — witness
    reds-on-revert / greens-on-restore both faces with byte-identical
    restoration; full suite 512/9811 green; typecheck + lint clean; the live
    obligation discharged by the orchestrator under the lock.
- Residuals:
  1. [test-design — RESOLVED in-run] the live acceptance fixtures are
     `mode: subagent`, not `mode: prompt`. `bind_context` is primarily a
     prompt-mode switch, but the `theta/load/unknown-bind-context-value` refusal
     arm is MODE-INDEPENDENT. The invoke-sentinel observation channel (b0298
     precedent) requires a SUBAGENT callee — `invoke` refuses a prompt-mode
     callee with `theta/load/prompt-mode-callable`, which would make a
     prompt-mode offender resolve `Err` for the wrong reason (vacuous) and a
     prompt-mode control non-invocable (this was the first live red). Both
     fixtures are subagent-mode so the same mode-independent refusal is
     exercised through a working channel; the pair still flips only the value's
     node kind (`bind_context: none` scalar vs. block sequence). Recorded, not a
     product defect.
  2. [test — non-blocking, pre-existing] `BinderModelLoadPassFile` /
     `loadPassResolveBinderModels` (`src/binder/binder-model.ts`) build a
     `BinderModelResolutionInput` from `bindModel?` only and lack the
     `bindModelUnresolvable` marker. Non-blocking because the seam has no
     production caller (production flows through `runComposePass`; only
     `tests/binder-model-resolution.test.ts` uses it) — no shipped behaviour is
     wrong. Worth aligning when the seam is next touched.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: NON-GOALS unchanged — the `mode:` face (0296,
    done), `description:`/`system:` non-scalar silence (0299/0301 territory), the
    `theta/parse/bind-context-session-on-subagent` warning (untouched, still keyed
    on scalar `"session"`), and truth-coercion of sequence contents (none — the
    non-scalar is refused, its contents never read) all stay out of scope. Parent
    adjudications (verbatim): (1) "`bind_context:` present-non-scalar routes to the
    existing `theta/load/unknown-bind-context-value` — mirroring 0296's Route-1
    mechanism exactly: a presence flag at the arm, `<value>` rendered as the
    bounded kind token (`array` for a sequence, `object` for a mapping or alias,
    `null` otherwise). EXTEND the placeholder-rendering-b.md:74 except-clause that
    0296 added so it names BOTH `theta/load/unknown-mode-value` and
    `theta/load/unknown-bind-context-value` (one shared clause, bug 0296/0297
    cited) — do not add a second parallel clause." (2) "`bind_model:`
    present-non-scalar is PRESENT-but-unresolvable: route it through the EXISTING
    binder-model-unresolved machinery exactly as an unresolvable declared string —
    record presence + an unresolvable marker, do NOT fabricate a string value; the
    rendering where a value is named is the same kind token; the bypass-eligible
    path keeps its existing present-but-unresolvable disposition
    (binder-bypass-and-envelope.md:10 — silently ignored there today for
    unresolvable strings; non-scalar behaves identically); record this disposition
    in the fix record. If threading the existing machinery without a fabricated
    string proves structurally impossible, STOP and report rather than inventing a
    new code." The bind_model disposition shipped exactly as adjudicated: a marker
    (no fabricated string), the existing `binder-model-unresolved` on non-bypass,
    the existing silently-ignored disposition on the bypass path (cell I control).
