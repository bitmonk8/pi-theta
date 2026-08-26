# Bug 0301 — Three recognised-field value shapes silently take defaults with zero diagnostics: a non-boolean `bind_echo:` (`no`, `"false"`, `0`) leaves echo ON; a non-mapping `tool_loop:` / `respond_repair:` value (`tool_loop: 5`, `respond_repair: none`) discards the author's cap or methodology; and a typo'd sub-key inside either block (`max_round:`, `methodolgy:`) is ignored without the unknown-key warning top-level keys get

- **Status:** open.
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
