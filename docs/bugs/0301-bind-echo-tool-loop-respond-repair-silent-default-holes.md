# Bug 0301 — Three recognised-field value shapes silently take defaults with zero diagnostics: a non-boolean `bind_echo:` (`no`, `"false"`, `0`) leaves echo ON; a non-mapping `tool_loop:` / `respond_repair:` value (`tool_loop: 5`, `respond_repair: none`) discards the author's cap or methodology; and a typo'd sub-key inside either block (`max_round:`, `methodolgy:`) is ignored without the unknown-key warning top-level keys get

- **Status:** fixed (0.332.0).
- **Sev/Diff estimate:** S3/D2 — silent author-intent drops on three
  recognised fields, each landing on a default that changes runtime
  behaviour (echo notes emitted against an author who suppressed them; a
  tool-call loop running 25 rounds against a declared 5; a respond-repair
  budget of 3×validator_error against a declared `none`). No wrong value
  reaches the model — the harm is the theta behaving as if the field were
  absent while the file says otherwise, undiagnosed at every severity. D2
  because three arms move (the `bind_echo` capture, the two block
  resolvers' non-map early return, and a sub-key walk), and the spec must
  first pin the dispositions — today it prescribes none of the three.
- **Kind:** spec gap, observably hazardous. The unknown-key tolerance is
  scoped to the TOP level by its own words
  (`docs/spec_topics/frontmatter/frontmatter-fields-a.md:32`: "Unknown keys
  at the top level of the frontmatter mapping are tolerated … and surface
  as a single warning per key"); no sentence assigns any disposition to
  (a) a non-boolean `bind_echo:` value — the field is pinned as
  "`true` | `false`; default `true`"
  (`docs/spec_topics/binder/defaulting-system-note-echo.md:28`) with no
  unrecognised-value arm, where the neighbouring `mode:` /
  `bind_context:` / `respond_repair.methodology:` each own one —
  (b) a `tool_loop:` / `respond_repair:` value that is not a mapping — the
  spec names `{}` as equivalent-to-absent
  (`frontmatter-fields-a.md:45–46`) and `theta/load/frontmatter-value-out-of-range`
  covers only a present SUB-FIELD's bad value
  (`docs/spec_topics/diagnostics/code-registry-load.md:21`) — or
  (c) an unrecognised sub-key inside either block.
- **Related:**
  - [0206](./0206-zero-entry-tools-scalar-loads-empty-callable-set.md)
    — fixed (0.159.0). The disposition template: a present `tools:` that
    declares nothing was distinguished from the absent field and refused.
    Face (b) is the same "present field that configures nothing" one block
    over.
  - [0104](./0104-tools-field-nonscalar-value-loads-empty-callable-set.md)
    — fixed (0.127.0). The node-kind precedent (a mapping where a
    scalar/sequence was expected → refusal, not silence); face (b) is its
    mirror image (a scalar/sequence where a mapping was expected → silence
    today).
- **Affected** (verified at bc52da38, v0.287.0):
  - `src/parser/frontmatter.ts:1117` — the `bind_echo` arm:
    `bindEchoValue = typeof rawValue === "boolean" ? rawValue : undefined` —
    every non-boolean scalar, and every non-scalar node, records the
    absent-field value. The in-source comment (`:1112–1115`) states the
    silence as designed: "a non-boolean value leaves the default-on
    behaviour".
  - `src/parser/frontmatter.ts:606–642` — `resolveNonNegIntBlock`: `:615`
    returns the default for any non-map block node (`tool_loop: 5`,
    `tool_loop: [x]`, `tool_loop: banana` — all silent); `:618–623` finds
    only the recognised sub-key, so unrecognised siblings are never seen.
  - `src/parser/frontmatter.ts:656–668` — `checkMethodology`: `:662` the
    same non-map early return (`respond_repair: none` — silent); `:665`
    the same recognised-sub-key-only find (`methodolgy:` — silent).
  - `src/parser/frontmatter.ts:1207–1215` — the top-level unknown-key
    warning (`theta/load/unknown-frontmatter-field`) that face (c)'s nested
    typos never reach.
- **Observed at:** 0.287.0 (bc52da38). Offline, deterministic: scratch
  vitest over `parseThetaDocument` via `tests/helpers/e2e-s1.ts` `parseDoc`
  (run and deleted).

## Reproduction

Each row one file (`---` fences, body `let x = 1`), production parse deps.
Every row: zero diagnostics, theta registers.

| frontmatter | recorded effect |
|---|---|
| `bind_echo: no` (+ two-string `params:`) | `bindEcho` absent → default `true`: echo emitted |
| `bind_echo: "false"` | same — echo emitted against a written "false" |
| `bind_echo: 0` | same |
| `bind_echo:` (bare) | same |
| `tool_loop: 5` | `toolLoop.maxRounds: 25` — the written 5 discarded |
| `tool_loop:` over `  - 5` | `maxRounds: 25` |
| `tool_loop:` over `  max_round: 5` (typo) | `maxRounds: 25`, no unknown-key warning |
| `respond_repair: none` | `{attempts: 3}` + methodology `validator_error` — the written `none` discarded |
| `respond_repair:` over `  attempts: 2` + `  methodolgy: none` (typo) | `attempts: 2` taken, methodology silently `validator_error` |

Controls: `bind_echo: false` records `false` (echo suppressed);
`tool_loop:` over `  max_rounds: "25"` refuses with
`theta/load/frontmatter-value-out-of-range` (the sub-field arm is
enforced); `respond_repair:` over `  methodology: nonsense` refuses with
`theta/load/unknown-methodology-value`; a TOP-level `methodolgy:` typo
draws `theta/load/unknown-frontmatter-field` (W).

## Expected behaviour

No current spec sentence prescribes the three dispositions — that absence
is the finding. What the corpus's own settled rules imply:

- **(a)** `defaulting-system-note-echo.md:28` closes `bind_echo:` at
  `true | false`. Every other closed-value frontmatter field owns an
  unrecognised-value error (`mode:` → `unknown-mode-value`, `bind_context:`
  → `unknown-bind-context-value`, `methodology:` →
  `unknown-methodology-value`, each citing the same
  recognised-key/unrecognised-value split rationale at
  `frontmatter-fields-a.md:36`/`:41`). `bind_echo:` is the one closed-set
  field with no split, and its silent arm points the harmful direction: the
  author who wrote a suppression gets the echo.
- **(b)** `frontmatter-fields-a.md:45–46` declare exactly `tool_loop: {}` /
  `respond_repair: {}` equivalent to absent. A present non-mapping value is
  outside that equivalence and outside
  `frontmatter-value-out-of-range`'s registered *Trigger*
  (`code-registry-load.md:21`, which requires the sub-field to be present).
  The `tools:` row's own words one table row up: "'absent' and
  'present-but-the-wrong-shape' do not collapse into one behaviour"
  (`frontmatter-fields-a.md:43`).
- **(c)** The top-level unknown-key warning exists so "an author who
  hand-edits frontmatter … must still see their theta load (with a visible
  warning)" (`frontmatter-fields-a.md:32`). A nested typo has strictly the
  same failure mode and gets no warning.

## Actual behaviour / root cause

Three narrowing sites map present-but-unreadable values onto the
absent-field representation before any validation arm runs:
`frontmatter.ts:1117` (boolean-only capture), `:615` and `:662` (non-map
early returns), and the two `items.find` calls (`:618`, `:665`) that walk
the blocks for the recognised sub-key only. Everything downstream keys on
the narrowed values, so none of the nine reproduction rows is
distinguishable from an absent field at any later point.

## Why it matters

- `bind_echo: no` is the YAML 1.1 habit spelling (YAML 1.2 core schema
  parses `no` as the string `"no"`); authors migrating Pi/K8s-style YAML
  reflexes hit it directly, and the failure direction is the privacy-ish
  one — bound arguments get echoed into the session against an explicit
  suppression.
- `tool_loop: 5` is the natural shorthand for a field whose only knob is a
  number; `respond_repair: none` is the natural shorthand given
  `methodology: none` is a documented value. Both silently run the default
  budgets — 25 tool rounds, 3 repair turns — which is token spend and
  behaviour the author explicitly bounded.
- The typo class (c) is the exact hazard the top-level warning was
  designed for, one indentation level down.

## Non-goals

- The `<observed>` newline rendering on
  `theta/load/frontmatter-value-out-of-range` — candidate 05, a different
  defect at the same function's emission.
- `mode:` / `bind_context:` / `system:` / `description:` node-kind and
  null-scalar faces — candidates 01–04.
- Truth-coercion of `bind_echo: "false"` or `no` — no coercion is proposed
  (the `bind_context:` registry row's "no truth-coercion" stance is the
  house style); the ask is a diagnostic, not a lenient read.
- Which severities the three dispositions take — a §Fix/spec decision;
  the report's claim is only that silence is the wrong one.

## Fix

Spec first (the gap is the spec's): pin the three dispositions in
`frontmatter-fields-a.md` (and the `docs/reference/frontmatter.md` mirror
rows), then enforce:

1. `bind_echo:` outside `true`/`false` → an unknown-value load error
   mirroring `unknown-bind-context-value` (new DIAG-2 row), or — minimum —
   a warning; the boolean capture at `:1117` gains a presence flag.
2. `tool_loop:` / `respond_repair:` present non-mapping value → a
   malformed-field refusal (the 0104/0206 shape) or a widened
   `frontmatter-value-out-of-range` trigger; the `{}` and absent spellings
   stay silent per the existing equivalence sentence.
3. Unrecognised sub-keys inside the two blocks → the existing
   `theta/load/unknown-frontmatter-field` warning with the dotted key
   (`tool_loop.max_round`), keeping the theta registered — the same
   forward-compat posture as top level, which also future-proofs the
   deferred per-block extensions in Future Considerations.

Constraints: the five control rows above keep their exact codes; committed
corpus unaffected (no committed `.theta` spells any of the nine shapes —
the shipped fixtures use `max_rounds:`/`attempts:`/`methodology:` correctly).

## Provenance

Fresh find. Probed at bc52da38 with a scratch vitest over `parseDoc` (nine
rows + five controls; deleted). Spec read: `frontmatter-fields-a.md:9`
(unknown-key policy's top-level scope), `:36–46` (field-contract rows),
FRNT-1 (`frontmatter-fields-b-and-templates.md`),
`defaulting-system-note-echo.md:28`, `code-registry-load.md:21`.
Prior-bug sweep: 0104/0206 (shape-refusal precedents), 0087 (bind_echo
note rendering — different subject), README index for
`bind_echo`/`tool_loop`/`respond_repair` — no prior report on any face.

## Fix (0.332.0)

- What shipped:
  - `src/parser/frontmatter.ts` — face (a): the `bind_echo:` arm now records
    presence + a scalar/kind rendering (mirroring the `bind_context:` arm) and a
    present non-boolean value draws the new `theta/load/unknown-bind-echo-value`
    (E), un-registering the theta — no truth-coercion. Face (b): a new
    `checkBlockShape` refuses a present non-mapping `tool_loop:` / `respond_repair:`
    value with `theta/load/malformed-tool-loop-field` /
    `theta/load/malformed-respond-repair-field` (E), naming the observed node kind;
    absent, a null scalar, and a mapping (incl. `{}`) stay silent. Face (c): a new
    `unknownSubKeyDiagnostics` walk over each block's mapping emits the EXISTING
    `theta/load/unknown-frontmatter-field` (W) with the dotted `<block>.<sub-key>`
    key for any sub-key outside the module-level `TOOL_LOOP_SUBKEYS` /
    `RESPOND_REPAIR_SUBKEYS` `Set`s, keeping the theta registered.
  - `docs/spec_topics/binder/defaulting-system-note-echo.md` — Echo policy states
    the unknown-bind-echo-value disposition (closed-set, no truth-coercion).
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md` — `bind_echo:` /
    `tool_loop:` / `respond_repair:` rows gain their present-but-bad refusal
    sentences; the unknown-key paragraph gains the nested dotted-sub-key sentence.
  - `docs/reference/frontmatter.md` — the three mirror rows + unknown-key mirror.
  - `docs/spec_topics/diagnostics/code-registry-load.md` — three new DIAG-2 rows.
  - `docs/reference/diagnostics.md` — three DIAG-2 mirror rows.
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md` — `<value>` list +
    0296/0297 except-clause extended to name `unknown-bind-echo-value`; a new
    `<kind>` emitting-site sub-bullet for the two malformed-*-field codes (token
    set unchanged — the existing settings-invalid-entry JSON-kind members); a
    `<field>` clause admitting the dotted nested-key form on
    `unknown-frontmatter-field`.
  - `tests/b0301-bind-echo-tool-loop-respond-repair-holes.test.ts` (offline
    witness, 20 cells) + `tests/live/acceptance/b0301live-bind-echo-nonboolean-load-refusal.test.ts`
    (one H9a cell).
- Gates: witness `npx vitest run tests/b0301-…` 20/20 green; full default suite
  `npm test` 514 files / 9843 tests green (was 513 / 9823); `npm run typecheck`
  clean; `npm run lint` clean; DIAG-2 corpus + mirror-parity gate
  (`registry-closed-set-corpus-gate`) 6/6 green; live cell green under the shared
  lock (offender `bind_echo: no` refused via invoke→Err→`REFUSED`; control
  `bind_echo: false` registered and drove, `877`).
- Review: 1 round — `bug-fix-reviewer` returned findings with no
  correctness/fidelity/spec blocker (one non-blocker spec-prose citation F1, two
  prose/comment residuals R2/R3); a `bug-fix-fixer-light` round applied F1
  (dropped a false Future-Considerations citation), R2b (accurate JSDoc bullet),
  R3 (mirror-row symmetry); all hunks comment/doc/prose only, so the post-polish
  confirmation review round was skipped per the gate-diff rule.
- Verification: SOLID. (1) revert-witness — neutralising the three 0301 emission
  sites red the 9 face cells, byte-exact restore (`git hash-object` matched) →
  20/20 green; (2) full suite 514 / 9843 green; (3) one end-to-end live H9a cell
  green (fixed path exercised for real); (4) lint + typecheck clean.
- Residuals:
  1. Live red-path was established OFFLINE (the revert-witness reds the exact
     `theta/load/unknown-bind-echo-value` the live cell's attribution guard
     requires; the sentinel channel flips `REFUSED`↔`LOADED` with the fix, so the
     cell cannot pass without it). A bespoke live-RED run was deliberately not
     performed — it would require reverting the SHARED, sibling-owned uncommitted
     `frontmatter.ts` and rebuilding, which risks sibling work; bounded and
     recorded here.
  2. `renderNonScalarBindContextKind`'s doc comment (sibling 0297 content) now
     also has a `bind_echo:` call site; its comment was left untouched because it
     is unowned by this fix and its statement is illustrative, not false.
- Discharge notes appended: none (no sibling bug doc required a note; the shared
  `frontmatter.ts` and `placeholder-rendering-b.md` were extended surgically
  without disturbing the 0296/0297/0299 additions).
- Pinned dispositions / non-goals:
  - Parent adjudications implemented verbatim: (a) `bind_echo:` outside literal
    boolean → NEW `theta/load/unknown-bind-echo-value` (a warning was REJECTED;
    the closed-set field refuses like its siblings; no truth-coercion —
    `bind_echo: "false"` refuses, does not coerce). (b) present non-mapping
    `tool_loop:` / `respond_repair:` → NEW dedicated
    `theta/load/malformed-tool-loop-field` / `theta/load/malformed-respond-repair-field`
    (the widened-`frontmatter-value-out-of-range` alternative was REJECTED);
    `{}` and absent stay silent. (c) unrecognised sub-keys → the EXISTING
    `theta/load/unknown-frontmatter-field` warning with the dotted key, theta
    stays REGISTERED — NO new code.
  - Bounded self-adjudication (recorded): a bare/null-scalar `tool_loop:` /
    `respond_repair:` block is treated as equivalent-to-absent (silent), not
    malformed — corpus-consistent with bug 0299's null-scalar-is-the-absent-case
    rule, the `tools:` field's null→`unknown-tool` (not malformed) disposition,
    and the `{}`/absent equivalence sentence. Pinned in the spec rows and locked
    by a control cell. It touches no witnessed reproduction row.
  - GOV-7/GOV-8: the three new registry rows + the widened `<kind>` emitting-site
    list ship in the same change under the version bump; the `<kind>` token SET is
    unchanged (reuses the settings-invalid-entry JSON-kind members), and the
    `<dotted-key>` closed enum is untouched (face (c) renders through `<field>`).
  - Non-goals held (per §Non-goals): no `<observed>` newline work; no
    mode/bind_context/system/description node-kind faces (sibling 0296/0297/0299);
    no truth-coercion.
