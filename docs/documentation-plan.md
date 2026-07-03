# pi-loom documentation — working plan

Status: draft. Owner: editor (human). Writers: subagents.
This is the working document for the user-facing documentation effort. It is not
user documentation itself and does not ship. It records decisions, the doc-set
shape, the writing workflow, and open questions.

## 1. Reference point

pi-loom has reached **1.0** and is published. The spec (`docs/spec.md` and
`docs/spec_topics/`) is **fully implemented**. Documentation is written against
1.0 as a *first release*: expect rough edges and absent nice-to-have features,
but do not document behaviour that the spec does not define or the runtime does
not exhibit.

## 2. Audience and voice

- Primary audience: senior+ software engineers, chiefly **loom authors** (people
  writing `.loom` / `.warp` files). A smaller secondary audience is **host
  integrators** (embedding/configuring the runtime as a Pi extension); keep their
  material in a separate cluster, do not blend it into author docs.
- Voice: factual, terse, no hype, no sales register. State facts then caveats.
  Present tense, active voice. No "simply / just / easy". Every claim must be
  testable or removable. See the style guide (§7) — it is binding on all writers.

## 3. Doc set (Diátaxis)

The set follows the Diátaxis model (learning vs. doing × practical vs.
theoretical). Five artifacts:

| Artifact | Diátaxis mode | Purpose | Location |
|---|---|---|---|
| README | (landing) | what loom is, the problem it solves, status, links out | `README.md` |
| Guide | Explanation | concepts, mental model, design rationale — no step-by-step | `docs/guide.md` |
| Tutorial | Tutorial | one guaranteed-to-work hands-on path for a newcomer | `docs/tutorial.md` |
| How-to guides | How-to | goal-titled recipes for competent users | `docs/how-to/*.md` |
| Reference | Reference | exact, normative behaviour for people who already know loom | `docs/reference/*.md` |

Boundaries that must hold (the classic Diátaxis failure is mixing modes):

- **Guide** explains *why/what*. It carries no step-by-step procedure and does
  not teach the first run — that is the Tutorial's job. It owns the central
  mental model: code interleaved with literal model-directed text; evaluation
  appends turns to a conversation; the success/fail/cancelled trichotomy; prompt
  vs. subagent mode; `.loom` vs. `.warp`.
- **Tutorial** teaches by one worked path. Learning-oriented, example-driven,
  never a grab-bag of tasks.
- **How-to** answers "how do I do X" for someone past the tutorial: e.g. bind
  slash-command arguments, call a tool from loom code, return a typed value
  across a subagent boundary, handle a `QueryError`, configure `tool_loop`.
- **Reference** is facts, not teaching: grammar, type system, frontmatter fields,
  schema subset, diagnostics registry, error/result model, hard ceilings, CLI /
  discovery surface.

## 4. Source-of-truth and drift discipline

The spec is normative for *implementers*. It is **not** the user Reference —
it is dense, REQ-ID-anchored, and written for a different reader. The user
Reference is a distinct artifact for authors. This creates a drift risk between
two normative-looking documents. Rules:

- **Reference** draws from the spec (normative) and is confirmed against the
  implementation (actual behaviour). A writer that finds spec/impl divergence
  **reports it to the editor**; it does not silently pick one.
- **Guide / Tutorial / How-to** take concepts from the spec but every example is
  **executed against the real runtime** (see §5). No example is written from
  spec prose alone.
- Mechanically-derivable Reference material — grammar, frontmatter field table,
  diagnostics code registry — is single-sourced or generated, never hand-copied,
  because hand-copying guarantees drift. Candidate sources:
  `docs/spec_topics/grammar.md`, `docs/spec_topics/frontmatter*`,
  `docs/spec_topics/diagnostics/`. (Decision D-3 below.)
- Terminology authority is the spec glossary
  (`docs/spec_topics/glossary.md`). Terms such as *callable set*, *operator*,
  *query-terminating*, *final value* must match it exactly. Every writer reads
  the glossary.

## 5. Examples must run

The largest quality risk in agent-authored language docs is plausible looms that
do not actually run. Therefore:

- Every non-trivial example is a real file under `docs/examples/`.
- **Parse validation (offline, automatic):** the committed-fixture parse gate
  (H7b) walks `docs/`, so every `docs/examples/*.loom` is lexed/parsed by
  `npm test` and must produce zero `loom/load/*` / `loom/parse/*` diagnostics —
  no extra wiring needed.
- **Runtime validation:** looms are exposed as Pi commands, so an example runs
  via `pi --loom docs/examples -p "/<stem>"` (requires a configured
  provider/model; no silent skip when absent — report `needs-provider`).
- `.warp` modules are not invocable; exercise them through a `.loom` that imports
  them.
- Docs embed examples by reference to the checked-in files, not by pasting
  divergent copies.

## 6. Writing workflow (agent-driven, human-edited)

The editor (human) does not write prose; the editor reviews and directs. Writing
is delegated to subagents. To keep review cheap:

- **One agent per document**, not per section — internal consistency is worth it.
  Cross-document consistency comes from the shared style guide (§7) and glossary,
  which every agent must read.
- Each delivered doc carries a **provenance appendix**: which spec sections /
  REQ-IDs / source files it covers, and where each non-trivial claim came from.
  This lets the editor verify coverage and correctness by spot-check.
- A doc-set **coverage matrix** tracks which surface is documented and which is
  not, so "done" is observable.

### Build order

1. README (thin — status + orientation + links).
2. Reference skeleton (even stubbed; it anchors everything else).
3. Guide (mental model).
4. How-to recipes (as the surface is exercised).
5. Tutorial **last** — it is the most expensive to keep correct and should be
   written against a settled surface.

## 7. Style guide (binding on all writers)

To be expanded into its own file (`docs/STYLE.md` or similar). Minimum rules:

- Factual, terse, no hype, no marketing voice.
- Present tense, active voice.
- State the fact, then the caveat.
- Banned words: "simply", "just", "easy", "obviously", "of course".
- Every claim is testable or removed.
- Terminology matches `docs/spec_topics/glossary.md` exactly.
- Code examples are real, checked-in, and CI-executed (§5).
- Cross-link into the Reference for definitions instead of re-deriving them.

## 8. Kickstart tooling (BUILT)

### 8.1 `/make-loom-docs` command — `.pi/prompts/make-loom-docs.md` ✅

An orchestration-only prompt (same shape as the existing
`.pi/prompts/loom-implement.md`): it holds no state in its head, delegates each
document to a writer subagent, and produces first-draft versions of the five
artifacts plus the `docs/examples/` set. Sketch:

- Step 0: read the style guide, glossary, and this plan. Confirm inputs exist.
- Step 1: build/refresh the Reference skeleton and coverage matrix.
- Step 2: fan out one writer subagent per document, in the §6 build order.
- Step 3: run the example harness (§5); fail loudly on any non-running example.
- Step 4: collect provenance appendices and update the coverage matrix.
- Output: draft docs for editor review; the command never publishes.

Argument (optional): which artifact(s) to (re)generate, default all.

### 8.2 Writer subagents — `.pi/agents/` ✅

Built (one focused agent each, `name` / `description` / `model` frontmatter,
`model: active/smart`):

- `loom-docs-reference-writer` — Reference pages from spec + impl; transcribes
  mechanical tables verbatim from their single spec source; reports spec/impl
  divergences rather than resolving them.
- `loom-docs-guide-writer` — the explanation/mental-model Guide **and** the thin
  README (both are orientation/explanation; D-5 resolved to one agent).
- `loom-docs-tutorial-writer` — the single hands-on path; must run every step.
- `loom-docs-howto-writer` — task recipes; one recipe = one goal.
- `loom-docs-example-runner` — materialises `docs/examples/` and parse+runtime
  validates them; the gate the other writers depend on.

Binding style rules live in `docs/STYLE.md` (built); every writer reads it plus
the glossary.

## 9. Decisions

- **D-1** (resolved) Directory layout: `docs/how-to/` and `docs/reference/` as
  folders.
- **D-2** (resolved) Host-integrator docs: a single short integration how-to in
  1.0; defer the rest.
- **D-3** (resolved) Reference derivation: hand-author prose; **transcribe**
  mechanical tables (diagnostics registry, grammar, frontmatter fields) verbatim
  from their single spec source page with a Provenance pointer; no separate
  generator in 1.0 — revisit if drift is observed. (A markdown-table generator is
  brittle against the spec's prose-heavy pages; verbatim transcription with
  provenance gives higher quality now and keeps drift detectable.)
- **D-4** (resolved) Example harness: parse validation is free via the H7b
  committed-fixture parse gate (`npm test`, walks `docs/`); runtime validation is
  `pi --loom docs/examples -p "/<stem>"`. No new harness needed.
- **D-5** (resolved) One `loom-docs-guide-writer` owns both Guide and README.
- **D-6** (resolved) The README does **not** enumerate specific rough edges or
  unimplemented nice-to-haves — they are not yet discovered. The status section
  states the 1.0 first-release posture in general terms only (spec fully
  implemented; a first release may have undiscovered rough edges), with no list.
