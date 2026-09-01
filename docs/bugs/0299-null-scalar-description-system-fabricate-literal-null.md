# Bug 0299 — A value-less `description:` or `system:` (a YAML null scalar: bare key, `null`, or `~`) is stringified to the four characters `null` and threaded verbatim: the slash command registers with the autocomplete description `null`, the binder system prompt renders `Description: null`, and a subagent child is spawned with the system prompt text `null` — where the sibling `argument-hint:` arm's `typeof === "string"` guard maps the same shape to absent

- **Status:** fixed (0.331.0).
- **Sev/Diff estimate:** S3/D1 — silent wrong values on three surfaces (Pi's
  autocomplete dropdown, the binder's grounding prompt, the spawned child's
  system prompt), each fabricated from a field the author left value-less;
  zero diagnostics at any severity. Bounded blast radius — the fabricated
  text is four known characters, not attacker-shaped — but the system-prompt
  surface hands those bytes to a model as its entire behavioural
  instruction. D1: the null case is one predicate per arm, and the
  `argument-hint:` arm already ships the correct guard to copy.
- **Kind:** defect — the implementation manufactures a value the author
  never wrote. YAML resolves a value-less key to null; JS
  `String(null)` is `"null"`; the arms record that string as the field's
  text. `docs/spec_topics/frontmatter/frontmatter-fields-a.md:37` gives
  `description` the default `null` with "The slash-command entry registers
  without description text; the binder prompt omits the `Description:`
  line" — the null VALUE is the spec's own name for the absent case, so an
  author writing `description: null` (YAML's explicit spelling of that
  value) getting the four-character STRING is the implementation
  contradicting the row's stated default semantics. For `system:`,
  `frontmatter-fields-a.md:44` prescribes "no system prompt" when the field
  carries none; the child instead receives the literal text `null`.
- **Related:**
  - [0209](./0209-binder-description-hint-all-break-value-emits-labelled-empty-line.md)
    — fixed (0.143.0). The nearest settled neighbour: a `description:`
    carrying only line breaks emitted the bare `Description: ` label. That
    fix tests the COLLAPSED value at the binder emission sites; `"null"` is
    non-empty after collapse, so it sails through and renders
    `Description: null`.
  - [0103](./0103-binder-description-argument-hint-lines-forgeable-by-newline.md)
    — fixed (0.131.0). Established the binder Description/Argument-hint
    render seam this report's value reaches.
  - [0170](./0170-system-prompt-argv-path-coercion.md) —
    fixed (0.89.0). The `--system-prompt` marshalling channel; its fix's
    leading-`\n` prefix (`subagent-launcher.ts:452–453`) means the child
    receives `"\nnull"` — inert as a path, wrong as a prompt.
- **Affected** (verified at bc52da38, v0.287.0):
  - `src/parser/frontmatter.ts:1093` — the `description` arm:
    `descriptionValue = isScalar(item.value) ? String(item.value.value) :
    undefined`. A null scalar is a scalar; `String(null)` → `"null"`.
  - `src/parser/frontmatter.ts:1172` — the `system` arm, same expression,
    same fabrication.
  - `src/parser/frontmatter.ts:1106–1108` — the `argument-hint:` arm, the
    in-file control: `isScalar(item.value) && typeof item.value.value ===
    "string" ? item.value.value : undefined` — the guard the other two arms
    lack.
  - `src/parser/frontmatter.ts:1520–1523` — the non-empty spread:
    `"null"` ≠ `""`, so it lands on `ParsedFrontmatter.description`.
  - `src/extension/theta-composition-producer.ts:393–395` →
    `src/extension/factory.ts:592–597` — `description` threads verbatim into
    `pi.registerCommand(name, { description, handler })` (the spec-pinned
    verbatim carriage, `registration-steps.md` step 3).
  - `src/binder/binder-system-prompt.ts:398` — `Description: null` (the
    collapsed-value guard passes; `"null"` carries no break).
  - `src/extension/production-theta-producer.ts:2012–2025`, `:2201` and
    `src/runtime/subagent-launcher.ts:452–453` — the `system` template
    (`parts: [{kind: "text", value: "null"}]`) renders to
    `systemPrompt: "null"` and is emitted as `--system-prompt "\nnull"`.
- **Observed at:** 0.287.0 (bc52da38). Offline, deterministic: scratch
  vitest over `parseThetaDocument` via `tests/helpers/e2e-s1.ts` `parseDoc`
  (run and deleted); threading verified by code read at the citations above.

## Reproduction

Each row one file (`---` fences, body `let x = 1`), production parse deps;
zero diagnostics on every row except the `argument-hint:` control, which
draws only the pre-existing `theta/load/argument-hint-not-displayed` (W —
about the absent `description:`, not about the null value; the theta
registers).

| frontmatter | recorded value |
|---|---|
| `mode: prompt` + `description:` | `description: "null"` |
| `mode: prompt` + `description: null` | `description: "null"` |
| `mode: prompt` + `description: ~` | `description: "null"` |
| `mode: subagent` + `system:` | `system.parts: [{kind:"text", value:"null"}]` |
| `mode: subagent` + `system: null` | same |
| `mode: prompt` + `argument-hint:` (control) | `argumentHint: undefined` — absent |
| `mode: prompt` + `description: ""` (control) | `description` absent (dropped at the non-empty spread) |

Downstream (by the citation chain above): row 1 registers a slash command
whose dropdown text is `null`; a binder pass over the same theta renders the
line `Description: null` into the binder model's grounding; rows 4–5 spawn
the child with `--system-prompt "\nnull"`.

Note the perverse orderings the three spellings produce: `description: ""`
→ absent (correct); `description:` → the text `null`. The EMPTIER spelling
produces the extra bytes. Same for `system: ""` (zero-part template, child
gets `""`) vs `system:` (child gets `null`).

## Expected behaviour

- `frontmatter-fields-a.md:37`: default for `description` is `null` — "the
  slash-command entry registers without description text; the binder prompt
  omits the `Description:` line. No warning". A field whose YAML value IS
  null conveys exactly that.
- `binder/binder-bypass-and-envelope.md:115` (item 2): the Description line
  appears iff the description is non-empty — a rendered `Description: null`
  asserts a description exists; the author supplied none.
- `frontmatter-fields-a.md:44`: no `system:` content → "the spawned
  conversation runs under the model's training defaults", not under the
  instruction `null`.
- The in-repo control: the `argument-hint:` arm already maps the null
  scalar to absent, so the two Pi-mirrored sibling fields (`description` /
  `argument-hint`, spec-paired at `frontmatter-fields-a.md` §Naming
  convention) disagree on the same input shape.

## Actual behaviour / root cause

`String(item.value.value)` over a scalar whose parsed value is `null`
manufactures the string `"null"` (`frontmatter.ts:1093`, `:1172`). Every
downstream guard is a non-emptiness test (`:1520–1523`; the collapsed-value
guards of 0209's fix at `binder-system-prompt.ts:398`), and `"null"` is
non-empty, so the fabricated text crosses all of them. The `argument-hint:`
arm (`:1106–1108`) shows the intended narrowing — `typeof === "string"` —
applied one field away.

`bind_model:` shares the mechanism with a fail-closed outcome: a bare
`bind_model:` records `"null"` and the binder-model resolution then fails
the load naming the value `'null'` — wrong-ish message text, but loud;
listed as a non-goal.

## Why it matters

- Three user-visible/model-visible surfaces carry fabricated bytes with
  zero diagnostics: the autocomplete dropdown (every operator of the
  session sees `null` as the command's blurb), the binder grounding (the
  binder model is told the theta's description is `null`), and — worst —
  the subagent system prompt, where `null` becomes the conversation's
  entire behavioural instruction for every query in the theta.
- The shape is an ordinary authoring intermediate: a stubbed
  `description:` / `system:` left value-less while drafting is exactly the
  file state that registers and runs.
- The `""` vs value-less asymmetry makes the behaviour unlearnable: the
  author who observes that `description: ""` is dropped will reasonably
  expect the value-less spelling to drop too.

## Non-goals

- Non-scalar `description:` / `system:` values — candidates 02/03 territory
  (node-kind seam, absent-collapse); this report is the null-SCALAR
  fabrication only.
- `mode:` / `bind_context:` bare keys — both fail closed today
  (`unknown 'mode:' value 'null'`, `unknown 'bind_context:' value 'null'`);
  whether `'null'` is the right rendering for a value-less key is cosmetic
  and out of scope.
- `bind_model:` bare — records the same fabricated `"null"`, which the
  load-time binder-model gate then fails to resolve on non-bypass thetas
  (`theta/load/binder-model-unresolved` naming `'null'`) and silently
  ignores on bypass-eligible ones (`binder-bypass-and-envelope.md:10`) —
  loud where it matters; only the message wording is arguable.
- Non-string non-null scalars (`description: 42` → `"42"`,
  `description: true` → `"true"`) — YAML-coercion of a value the author DID
  write; a different (and defensible) disposition.

## Fix

Map the null scalar to absent at the two arms, mirroring the
`argument-hint:` guard: `isScalar(v) && v.value !== null` before
stringifying (or the stricter `typeof v.value === "string"` for
`system:`, whose value is a prompt, not a label — decide and record which
coercions stay). `description:`'s numeric/boolean coercion can stay or go;
either way the null case stops fabricating text. Constraints: zero
diagnostics before and after (the absent case is warning-free by spec);
`description: ""` control unchanged; the 0209 witness
(`tests/binder-prompt-all-break-description-hint-empty-line.test.ts`) stays
green; a `system:`-side change keeps `system: ""` behaviour byte-identical
(zero-part template).

## Fix (0.331.0)

- What shipped: `src/parser/frontmatter.ts` — the `description` arm gains the
  minimal null guard `isScalar(item.value) && item.value.value !== null ?
  String(item.value.value) : undefined` (§Fix); the `system` arm becomes a
  three-way `if/else` mapping a non-scalar node → `undefined` (the pre-existing
  `theta/load/malformed-system-field` refusal is preserved), a null scalar →
  `""` (flows through the identical `system: ""` path to a zero-part template
  `{ parts: [] }`), and any other scalar → `String(value)` (numeric/boolean
  coercion stays). Both arms carry a WHY comment citing bug 0299.
- Parent adjudication (verbatim): "Map the null scalar to absent at BOTH arms
  via the minimal guard `isScalar(v) && v.value !== null` — numeric/boolean
  coercion STAYS at both arms (a written `description: 42` keeps recording
  "42"; non-null non-string scalars are the doc's recorded non-goal — 'a
  different (and defensible) disposition'). The stricter typeof-string guard is
  NOT adopted: minimality wins; only the null fabrication stops." The `system`
  arm maps the null scalar to `""` (not `undefined`): the literal `undefined`
  would trip `theta/load/malformed-system-field` (its non-scalar detector keys
  on `systemValue === undefined`), emitting a NEW error and breaking the §Fix
  constraints "zero diagnostics" and "`system: ""` byte-identical" — `""` is the
  bounded reconciliation that meets both constraints.
- Gates: witness `tests/b0299-null-scalar-description-system-absent.test.ts`
  12/12 green (7 formerly-red rows flip, 5 controls hold); revert-witness
  confirmed RED (7 fail with the fabrication signature) then GREEN, restore
  byte-exact (`git hash-object` 99fb6fb35c3f5ce5bfb42ac67253aa954f77414f
  unchanged); full `npm test` 513 files / 9823 tests green; `npm run typecheck`
  clean; `npm run lint` clean.
- Review: 1 round — `bug-fix-reviewer` verdict CLEAN, no
  correctness/fidelity/spec finding; two non-blocking residuals (R1 direct
  `system: ""` control, R2 comment naming the malformed-system-field trap) both
  discharged by a `bug-fix-fixer-light` polish round (comment + one test
  control row); confirmation round skipped — polish verified by gate-diff
  (comment/test-only, no executable line; gates re-run green).
- Verification: `bug-fix-verifier` verdict SOLID — witness reds on revert with
  byte-exact restore; suite green (one unrelated cross-file flake
  `tests/invoke-prompt-cell-enum-return.test.ts`, bug 0174 fixed 0.98.0, passed
  on isolated and full re-run); lint/typecheck clean; 0209 witness
  `tests/binder-prompt-all-break-description-hint-empty-line.test.ts` stays
  green.
- Live: registration outcome is unchanged by this fix (a null-scalar
  `description:`/`system:` theta registers before and after — only the recorded
  values are corrected), so no bespoke live cell is owed. Satisfied under the
  shared live lock by two existing cells:
  `tests/live/acceptance/b0297live-bind-context-nonscalar-load-refusal.test.ts`
  (registers and drives the scalar control theta through real `pi -p`) and
  `tests/live/acceptance/b0298live-system-nonscalar-load-refusal.test.ts`
  (registers and drives a scalar-`system:` subagent control child — exercising
  the system-prompt surface this fix touches — and its refusal leg confirms the
  non-scalar `system:` malformed refusal my `system` arm preserves). Both green.
- Residuals: none.
- Discharge notes appended: none (no sibling doc affected).
- Pinned dispositions / non-goals: non-scalar `description:`/`system:` values
  untouched; `mode:`/`bind_context:` bare keys untouched (fail closed today);
  `bind_model:` bare untouched (loud where it matters); non-string non-null
  scalars still coerced (`description: 42` → "42", `system: 42` → "42").

## Provenance

Fresh find (no prior report names the null-scalar class on any frontmatter
field; README sweep for `null` + field names). Probed at bc52da38 with a
scratch vitest over `parseDoc` (seven rows above; deleted). Threading
verified by code read: `theta-composition-producer.ts:393–395`,
`factory.ts:592–597`, `binder-system-prompt.ts:398`,
`production-theta-producer.ts:2012–2025`/`2201`,
`subagent-launcher.ts:452–453`. Spec read: `frontmatter-fields-a.md:37`,
`:44`; `binder/binder-bypass-and-envelope.md:115`;
`registration-steps.md` step 3 (verbatim `description` carriage).
