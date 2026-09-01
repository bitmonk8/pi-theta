# Bug 0296 — A `mode:` field whose value is a YAML sequence or mapping draws `theta/load/missing-mode` — "frontmatter is missing required field 'mode:'" — on a file whose `mode:` line is present, where the field-contract table says "missing" and "present-but-bad" do not collapse into one code

- **Status:** fixed (0.329.0).
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

## Fix (0.329.0)

- What shipped:
  - `src/parser/frontmatter.ts` — the `mode` arm now records `modePresent` for any present `mode:` and, for a non-scalar value node, its bounded kind token via the new `renderNonScalarModeKind` helper (null-value-node→`null`, sequence→`array`, mapping→`object`, alias→`object` fallback), mirroring the `settings-value-out-of-range` `<observed>` precedent; the required-mode arm gates on `!modePresent` (genuine absence only, `!yamlErrored` preserved) instead of `modeValue === undefined`; the `unknown-mode-value` arm gates on `modePresent` and renders `<value>` as the scalar bytes (line-break-normalised) or the recorded kind token. Route 1 of §Fix — `theta/load/unknown-mode-value` reused unchanged: no new code minted, no registry/doc text edit.
  - `tests/b0296-mode-nonscalar-value-collapse.test.ts` — offline witness (9 cells): flow-seq / block-seq / flow-map → `unknown-mode-value` `array` / `array` / `object`; controls bare-`mode:`→`null`, `mode: PROMPT`→`PROMPT`, genuine-absence→`missing-mode`; alias→`object` and `? mode`→`null`; a DIAG-4 anchor on the reused registry Message template.
- Gates:
  - Witness: `npx vitest run tests/b0296-mode-nonscalar-value-collapse.test.ts` → 9/9 pass. Red-before/green-after proven by copy-based revert (no git stash/checkout): the pre-fix tree reds cells A/B/C/G/H with `got codes ["theta/load/missing-mode"]` where `unknown-mode-value` is expected; restore is byte-identical (`git hash-object` match).
  - Full suite: `npm test` → 510 files / 9796 tests pass.
  - Typecheck: `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) — clean.
  - Lint: `npm run lint` (`eslint "src/**/*.ts"`) — clean.
  - Live: `b0298live-system-nonscalar-load-refusal` → 1/1 pass under the shared lock (`C:/UnitySrc/pi-theta/.pi/tmp/fix-open-bugs/live.lock`, VERBATIM protocol) — the same `parseFrontmatter` load-refusal registration path through the real `pi -p` binary; the mode case is refused-before / refused-after (only the code+message correct), so no bespoke live cell is owed.
- Review: 2 rounds. R1 (`bug-fix-reviewer`) — F1 [spec] (`placeholder-rendering-b.md:74` stale for the non-scalar `<value>`; parent-reserved), F2 [correctness] (`? mode` no-value-node rendered `object`, a lie of kind — fixed to `null`), F3 [test] (alias/no-value-node collapse-class members unwitnessed; two cells added). R2 (`bug-fix-reviewer`, deep-routed because R1 raised correctness+spec) — CLEAN; F2/F3 confirmed resolved, F1 re-flagged, only a non-blocking prose residual (R1). Loop converged.
- Verification: `bug-fix-verifier` PASS — witness reds-on-revert / greens-on-restore with byte-identical restoration; full suite 510/9796 green; typecheck + lint clean; live discharged by the orchestrator under the lock.
- Residuals:
  1. [spec — DISCHARGED by parent ratification] `docs/spec_topics/diagnostics/placeholder-rendering-b.md:74`, category "Parse-time literal-value (`<value>`)", closed with "every other row in this list binds a source-text substring directly." The fix makes `theta/load/unknown-mode-value`'s non-scalar `<value>` bind the JSON kind token (`array` / `object` / `null`), not a source substring, so that clause was stale. Resolved by amending the :74 bullet's exception chain with an except-clause mirroring the existing `theta/load/invalid-derived-tool-name` exception, per the following parent ratification (verbatim): "Amend the Parse-time literal-value paragraph of docs/spec_topics/diagnostics/placeholder-rendering-b.md (the bullet starting '- **Parse-time literal-value** (`<value>`)', currently line 74) with an except-clause mirroring the existing invalid-derived-tool-name exception: on `theta/load/unknown-mode-value`, when the `mode:` field's value node is not a YAML scalar (bug 0296), the bound value is the node's kind token — `array` for a sequence, `object` for a mapping or alias, `null` otherwise — not a source substring, rendered unquoted regardless of identifier shape exactly as the unquoted-YAML-scalar exception, so the surrounding quotes come from the registry template." Edited file: `docs/spec_topics/diagnostics/placeholder-rendering-b.md`. The registry row (`code-registry-load.md:23`) remains untouched; its Message template still matches the emission byte-for-byte.
  2. [prose — non-blocking, pre-existing] the invariant comment above the registration cast in `src/parser/frontmatter.ts` names only the missing-mode route as its justification; the claim stays true post-fix (a present non-scalar `mode:` also pushes an error via `unknown-mode-value`), but the wording is non-exhaustive (already so pre-fix, for the `yamlErrored` route). Left untouched to keep the diff tight — the region is uncited by this fix and the lane later carries sibling bugs 0297/0299/0301 in the same file.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: NON-GOALS unchanged — the unclosed-fence collapse (different mechanism, unfiled) and scalar-value handling (bare `mode:` / `mode: PROMPT`, pinned as controls D/E) stay out of scope. Parent adjudication (verbatim): "Route 1 of §Fix: reuse `theta/load/unknown-mode-value` for the present-non-scalar case — the registry Trigger's letter already covers it; no new DIAG-2 row. The required-mode arm keys on a `modePresent` flag (recorded at the mode arm) instead of `modeValue !== undefined`; `<value>` rendering for a non-scalar node is the bounded kind token (per the settings-value-out-of-range precedent), not a source slice."
