# Bug 0296 — A `mode:` field whose value is a YAML sequence or mapping draws `theta/load/missing-mode` — "frontmatter is missing required field 'mode:'" — on a file whose `mode:` line is present, where the field-contract table says "missing" and "present-but-bad" do not collapse into one code

- **Status:** open.
- **Sev/Diff estimate:** S3/D1 — a wrong-attribution diagnostic on a present
  field: the refusal is fail-closed and total (the theta does not register),
  but the one diagnostic emitted asserts a fact the source contradicts, and
  following its registry *Hint* ("Add `mode: prompt` or `mode: subagent`")
  adds a duplicate key and converts the failure into
  `theta/load/malformed-frontmatter-yaml`. D1 because the value node and its
  range are already in hand at the field arm — the fix is routing the
  non-scalar case to the present-but-bad code (or a shape refusal) instead of
  leaving `modeValue` undefined.
- **Kind:** defect — a diagnostic names a cause the source does not exhibit.
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:36` (the `mode` row):
  "An unrecognised value (e.g. `mode: agent`) is the separate
  `theta/load/unknown-mode-value` — 'missing' and 'present-but-bad' do not
  collapse into one code, because the authoring intent differs."
  `docs/spec_topics/diagnostics/code-registry-load.md:18` pins
  `theta/load/missing-mode`'s *Trigger* as "Frontmatter omits the required
  `mode:` field", and `:23` pins `theta/load/unknown-mode-value`'s *Trigger*
  as "`mode:` is present but its value is neither `prompt` nor `subagent`" —
  a sequence-valued `mode:` satisfies the second trigger's letter and the
  first fires instead.
- **Related:**
  - [0263](./0263-params-type-bare-double-quote-breaks-frontmatter-misattributed.md)
    — fixed (0.262.0). The same misattribution one level up: a YAML-rejected
    block drew `missing-mode` with `mode: prompt` present. Its fix gated the
    missing-mode arm on `!yamlErrored` only; a block that PARSES with a
    non-scalar `mode:` value still collapses.
  - [0104](./0104-tools-field-nonscalar-value-loads-empty-callable-set.md)
    — fixed (0.127.0). The node-kind precedent at the sibling `tools:` field:
    a non-scalar value was treated as absent; the fix added
    `theta/load/malformed-tools-field` at the arm where the node and range
    are in hand.
- **Affected** (verified at bc52da38, v0.287.0):
  - `src/parser/frontmatter.ts:1070–1072` — the `mode` arm of the field loop:
    `modeValue = isScalar(item.value) ? String(item.value.value) : undefined`.
    A sequence, mapping, or alias value leaves `modeValue` undefined, exactly
    as an absent key does. `modeRange` IS recorded (`:1073`), then never used.
  - `src/parser/frontmatter.ts:1224–1231` — the required-`mode:` arm:
    `if (modeValue === undefined && !yamlErrored)` pushes
    `theta/load/missing-mode` with the fixed message. Post-0263 it excludes
    YAML-rejected blocks but cannot distinguish "key absent" from
    "key present, value non-scalar".
  - `src/parser/frontmatter.ts:1315–1325` — the `unknown-mode-value` arm,
    gated on `modeValue !== undefined`, so the non-scalar case never reaches
    it.
- **Observed at:** 0.287.0 (bc52da38). Offline, deterministic: scratch vitest
  over `parseThetaDocument` via `tests/helpers/e2e-s1.ts` `parseDoc` (run and
  deleted).

## Summary

`mode:` is the only required frontmatter field, and the spec splits its
failure surface in two: absent → `theta/load/missing-mode`;
present-but-unrecognised → `theta/load/unknown-mode-value`. The field loop
recovers the value only for scalar nodes; for any other node kind it records
`undefined`, and the required-field arm then reports the field as missing.
The message — "frontmatter is missing required field 'mode:'" — is false of
the source, and the registry *Hint* ("Add `mode: prompt` or
`mode: subagent`") directs the author to add a key the file already has,
which YAML then rejects as a duplicate key
(`theta/load/malformed-frontmatter-yaml`).

Null-scalar and unrecognised-scalar values take the correct arm
(`mode:` bare → `unknown 'mode:' value 'null'`; `mode: PROMPT` →
`unknown 'mode:' value 'PROMPT'`): the collapse is specifically the
node-kind seam, the same seam bug 0104 closed at `tools:`.

## Reproduction

Each row is one file: `---`, the field lines, `---`, body `let x = 1`.
Parsed through `parseThetaDocument` with the production parse deps;
"diagnostics" is the complete list at every severity.

| frontmatter | diagnostics |
|---|---|
| `mode: [prompt]` | `error theta/load/missing-mode :: frontmatter is missing required field 'mode:'` |
| `mode:` over `  - prompt` | `error theta/load/missing-mode` (same message) |
| `mode: {a: 1}` | `error theta/load/missing-mode` (same message) |
| `mode:` (bare, null scalar — control) | `error theta/load/unknown-mode-value :: unknown 'mode:' value 'null'; expected 'prompt' or 'subagent'` |
| `mode: PROMPT` (control) | `error theta/load/unknown-mode-value :: unknown 'mode:' value 'PROMPT'; …` |

All five refuse registration (`frontmatter: null` on the returned document).
Only the first three misattribute.

## Expected behaviour

- `docs/spec_topics/frontmatter/frontmatter-fields-a.md:36`: "'missing' and
  'present-but-bad' do not collapse into one code, because the authoring
  intent differs." A `mode: [prompt]` line is authored intent for `mode`,
  not an omission.
- `docs/spec_topics/diagnostics/code-registry-load.md:23`
  (`theta/load/unknown-mode-value` *Trigger*): "`mode:` is present but its
  value is neither `prompt` nor `subagent`." A sequence value is present and
  is neither.
- `docs/spec_topics/diagnostics/code-registry-load.md:18`
  (`theta/load/missing-mode` *Trigger*): "Frontmatter omits the required
  `mode:` field." False of every reproduction row above.

## Actual behaviour / root cause

`src/parser/frontmatter.ts:1070–1072` narrows the recovered value to scalar
nodes and discards everything else as `undefined`. The two downstream arms
key exclusively on `modeValue`: `:1224` fires `missing-mode` on `undefined`,
`:1315` fires `unknown-mode-value` on a defined non-`prompt`/`subagent`
string. No arm reads the node kind, so a present non-scalar `mode:` is
indistinguishable from an absent key by the time either arm runs — the same
"treated as absent" collapse bug 0104 documented for `tools:`, except here
the absent case is itself an error, so the collapse surfaces as a lying
diagnostic rather than a silent load.

## Why it matters

- The one diagnostic on the file states a cause the author can refute by
  looking at their own source, and its remedy path is a dead end: adding
  `mode: prompt` beside the existing `mode:` key makes the block invalid
  YAML (duplicate key), trading one wrong diagnostic for a parse failure.
- The spec sentence violated is the mode row's own design rationale — the
  split exists precisely so authoring intent is named correctly.
- The shape is reachable from ordinary YAML habit: `mode:\n  - prompt` is a
  one-keystroke slip (`-` prefix) from the documented list-form `tools:`
  syntax two lines away in the same frontmatter block.

## Non-goals

- The unclosed-fence collapse (`---` never closed → whole file treated as
  having no frontmatter → `missing-mode` while a `mode:` line is visible in
  the source). Different mechanism (`extractFrontmatterBlock` returns
  `undefined`, `src/parser/frontmatter.ts:331–343`), same misattribution
  family; recorded in the hunt log, not filed here.
- Scalar-value handling (`mode:` bare, `mode: PROMPT`) — correct today, and
  the reproduction table pins both as controls.
- Whether the non-scalar case should be `unknown-mode-value` or a new
  shape-refusal code — a §Fix choice, not a subject widening.

## Fix

Route the present-but-non-scalar case to a present-but-bad diagnostic at the
`mode` arm, where the node and `modeRange` are in hand. Two routes:

1. **Reuse `theta/load/unknown-mode-value`.** Render the offending node for
   `<value>` (the registry's *Trigger* at `code-registry-load.md:23` already
   reads "value is neither `prompt` nor `subagent`", which covers it; the
   `<value>` rendering for a non-scalar needs a bounded form — the JSON kind
   token per the `settings-value-out-of-range` precedent, or the source
   slice line-break-normalised). Cheapest; one arm keys on
   `modePresent` instead of `modeValue !== undefined`.
2. **A dedicated node-shape code** (`theta/load/malformed-mode-field`,
   mirroring bug 0104's `malformed-tools-field`). Costs a DIAG-2 registry row
   and mirror.

Constraints either way: the theta still refuses registration; `missing-mode`
fires only when the key is genuinely absent (its registry *Trigger* stays
true unamended); the bare-`mode:` null-scalar row keeps
`unknown-mode-value 'null'`; message stays single-line for any interpolated
source text.

## Provenance

Fresh find. Probed at bc52da38 with a scratch vitest over `parseDoc`
(five rows above plus sibling-field sweeps); scratch deleted. Spec read:
`frontmatter-fields-a.md` field-contract table in full;
`code-registry-load.md:17–25`. Prior-bug sweep: 0263 (YAML-rejected block —
fixed, distinct mechanism), 0104/0206 (`tools:` node-kind/zero-entry — the
disposition precedent), README index for `missing-mode` / `unknown-mode`.
