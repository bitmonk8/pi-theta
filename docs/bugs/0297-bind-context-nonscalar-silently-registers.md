# Bug 0297 — A `bind_context:` whose value is a YAML sequence or mapping registers the theta silently with the default `none`, where the registry row refuses registration for a present value that "is neither `none` nor `session`" — and the sibling `bind_model:` non-scalar falls back to `theta.binderModel` on the same silent path

- **Status:** open.
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
