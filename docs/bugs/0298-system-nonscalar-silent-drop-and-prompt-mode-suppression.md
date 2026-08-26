# Bug 0298 — A `system:` whose value is a YAML sequence or mapping is silently treated as absent: a subagent-mode theta registers with zero diagnostics and spawns its child with NO system prompt, and on a `mode: prompt` theta the same shape suppresses `theta/parse/system-on-prompt-mode` — the code whose registered trigger is the field being "declared"

- **Status:** open.
- **Sev/Diff estimate:** S2/D1 — the author's system prompt — the field that
  fixes the spawned conversation's behaviour for every query in the theta —
  is dropped with zero diagnostics at any severity, and the theta runs to
  completion returning values computed under the model's training defaults.
  Nothing downstream can notice: the child is spawned with
  `--system-prompt ""` exactly as for a theta that declared no `system:`.
  The prompt-mode half additionally silences an E-severity code whose
  trigger the input satisfies. D1 because the value node is in hand at the
  `system` arm and the fix mirrors bug 0104's one-arm refusal.
- **Kind:** defect — silent narrowing of author intent, plus a suppressed
  registered diagnostic. `docs/spec_topics/diagnostics/code-registry-parse.md:125`
  pins `theta/parse/system-on-prompt-mode`'s *Trigger* as "`system:`
  frontmatter field declared on a `mode: prompt` theta" — a block-sequence
  `system:` is declared, and the code does not fire.
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:44` (the `system`
  row) gives the no-system-prompt behaviour to the ABSENT field ("Default
  when absent: no system prompt"); no sentence gives a present non-scalar
  `system:` a silent-absent disposition, and the field family's settled
  precedent (bug 0104 at `tools:`, `frontmatter-fields-a.md:43`'s
  "'absent' and 'present-but-the-wrong-shape' do not collapse into one
  behaviour") is refusal.
- **Related:**
  - [0104](./0104-tools-field-nonscalar-value-loads-empty-callable-set.md)
    — fixed (0.127.0). The node-kind hole at `tools:`; its fix record's
    rationale ("the author's text names `read` and the theta cannot call
    it") transfers verbatim: here the author's text spells a system prompt
    and the child never sees it.
  - [0170](./0170-system-prompt-argv-path-coercion.md) —
    fixed (0.89.0). The `system:` marshalling channel this report's dropped
    value never reaches; cited for the threading map only.
  - Candidates 01/02 in this batch — the same field-loop scalar-only
    narrowing at `mode:` / `bind_context:`; each face violates its own spec
    sentence.
- **Affected** (verified at bc52da38, v0.287.0):
  - `src/parser/frontmatter.ts:1168–1175` — the `system` arm:
    `systemPresent = true; systemValue = isScalar(item.value) ?
    String(item.value.value) : undefined`. Presence IS recorded, then never
    consulted on the non-scalar path.
  - `src/parser/frontmatter.ts:1467` — the gate
    `if (systemPresent && systemValue !== undefined)`: the whole `system:`
    checking block — `checkSystemInterpolation`, which owns BOTH the
    subagent-mode template construction AND the
    `theta/parse/system-on-prompt-mode` emission
    (`src/parser/system-interpolation.ts:53–54`) — is skipped when
    `systemValue` is undefined, so a non-scalar `system:` draws neither the
    prompt-mode refusal nor any shape diagnostic.
  - `src/extension/production-theta-producer.ts:2012–2025`, `:2201` — the
    spawn-side consumer: `theta.frontmatter.system` undefined →
    `systemPrompt: systemPrompt ?? ""`.
  - `src/runtime/subagent-launcher.ts:452–453` — the argv emission:
    `--system-prompt` with `""` for the empty case, i.e. the child runs
    under host defaults exactly as for an omitted field.
- **Observed at:** 0.287.0 (bc52da38). Offline, deterministic: scratch
  vitest over `parseThetaDocument` via `tests/helpers/e2e-s1.ts` `parseDoc`
  (run and deleted).

## Reproduction

Each row is one file (`---` fences, body `let x = 1`), parsed through
`parseThetaDocument` with the production parse deps.

| frontmatter | diagnostics | `frontmatter.system` |
|---|---|---|
| `mode: subagent` + `system:` over `  - You are a reviewer` | `[]` | `undefined` (absent) |
| `mode: subagent` + `system:` over `  text: You are a reviewer` | `[]` | `undefined` (absent) |
| `mode: prompt` + `system:` over `  - You are a reviewer` | `[]` — theta REGISTERS | `undefined` |
| `mode: prompt` + `system: hello` (control) | `error theta/parse/system-on-prompt-mode :: 'system:' is not permitted on a mode: prompt theta` | — (not registered) |
| `mode: subagent` + `system: ""` (control) | `[]` | template with zero parts |

Rows 1–2: the registered theta's `system` slot is indistinguishable from an
omitted field; the spawn path (`production-theta-producer.ts:2201` →
`subagent-launcher.ts:452–453`) sends the child `--system-prompt ""`.

Rows 3 vs 4: the same `mode: prompt` file flips from E-refusal to clean
registration on the YAML node kind of the `system:` value alone.

## Expected behaviour

- `code-registry-parse.md:125`: `system:` *declared* on a `mode: prompt`
  theta is `theta/parse/system-on-prompt-mode` (E). Row 3 declares it.
- `frontmatter-fields-a.md:44` + `frontmatter-fields-b-and-templates.md`
  §`system`: the no-system-prompt behaviour belongs to the omitted field;
  a present field is "fixed once when the spawned conversation is created
  and applies to every query". A present field whose content cannot be read
  has no admitted silent disposition; the family rule
  (`frontmatter-fields-a.md:43`, `tools:` row) is that absent and
  present-but-the-wrong-shape do not collapse.

## Actual behaviour / root cause

The `system` arm narrows to scalars (`frontmatter.ts:1168–1175`); the gate
at `:1467` requires a defined `systemValue` before ANY `system:` rule runs.
Both the subagent template construction and the prompt-mode refusal live
behind that gate (`checkSystemInterpolation`,
`src/parser/system-interpolation.ts`), so the non-scalar class exits the
parser as if the key were never written. `systemPresent` — set at `:1171`
precisely to distinguish presence — is dead on this path.

## Why it matters

- The system prompt is the highest-leverage single input to a subagent
  theta's behaviour: every query in the spawned conversation runs under it.
  Silently substituting "no system prompt" changes every model response in
  the theta while the theta itself loads, registers, runs, and returns
  values normally — the purest form of the "author intent dropped with zero
  diagnostics" class.
- The block-sequence spelling is an ordinary YAML reflex for multi-line
  text (`system:` over `- line1` / `- line2`); the correct spellings
  (`system: |` block scalar) and the broken one differ by two characters.
- On `mode: prompt` the same shape turns a registered E-severity refusal
  into a clean load: an author moving a `system:`-bearing block between
  files can carry a prompt-mode violation invisibly.

## Non-goals

- The null-scalar `system:` (bare `system:` → the literal text `"null"` as
  the system prompt) — candidate 04, a different mechanism
  (`String(null)` fabrication) with a different observable (wrong bytes vs
  no bytes).
- `${…}` interpolation diagnostics — behind the same gate but only
  reachable with a scalar value; unaffected.
- `subagent fn with { system: … }` — a body-side surface with its own
  validation path (FN-7); not probed here.
- The `system: ""` zero-part template (row 5) — registers and sends
  `--system-prompt ""`; equivalent to absent by observation, and the spec is
  silent; recorded in the hunt log only.

## Fix

Key the `system:` checking block on `systemPresent` (already recorded), not
on `systemValue !== undefined`:

- `mode: prompt` + any present `system:` → `theta/parse/system-on-prompt-mode`
  (the registered trigger already covers it; no new code).
- `mode: subagent` + present non-scalar `system:` → a shape refusal. Either
  a dedicated `theta/load/malformed-system-field` (DIAG-2 row + mirror, the
  0104 shape) or — cheaper — extend an existing malformed-field code's
  trigger; the choice needs the registry edit in the same commit either way.

Constraints: scalar behaviour byte-identical (rows 4–5 and every committed
fixture — the corpus's `system:` values are all block/plain scalars); theta
not registered on the refusal; message single-line.

## Provenance

Fresh find. Probed at bc52da38 with a scratch vitest over `parseDoc` (rows
above; deleted); spawn-side threading verified by code read
(`production-theta-producer.ts:2012–2025`, `:2201`;
`subagent-launcher.ts:340–341`, `:452–453`). Spec read:
`frontmatter-fields-a.md:44`, `frontmatter-fields-b-and-templates.md`
§`system` in full, `code-registry-parse.md:125`. Prior-bug sweep: 0170
(marshalling), 0104/0206 (node-kind precedent), README index for `system` —
no prior report on the load-side node-kind class.
