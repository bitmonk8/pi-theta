# pi-theta documentation style guide

Binding on every writer (human or agent) of user-facing pi-theta documentation.
This file is the authority the doc-writing subagents read before producing prose.

## Audience

Senior+ software engineers, chiefly **theta authors**. Assume fluency with
programming languages, type systems, and CLIs. Do not explain general
programming concepts. Do explain theta-specific concepts.

## Voice

- Factual, terse, no hype. No marketing register, no sales language.
- Present tense, active voice.
- State the fact first, then the caveat.
- Do not oversell capabilities or minimise limitations.
- No praise of the reader, the tool, or the design.

## Banned words and phrases

`simply`, `just`, `easy`, `easily`, `obviously`, `of course`, `powerful`,
`seamless`, `blazing`, `simply put`, `note that` (state the note directly),
`please`. Remove them; do not substitute a synonym for the same effect.

## Claims

- Every claim is testable or is removed.
- Do not describe behaviour the spec does not define or the runtime does not
  exhibit. When spec and implementation disagree, stop and report to the editor;
  do not pick one silently.

## Citations

- A citation into a TypeScript construct names the file and the symbol, never a
  line: "`lowerParamsFieldType` (`src/parser/params.ts`)". The enforced scope is
  `src/**`, `tests/**`, the spec pages and `docs/reference/**`. A line number is
  a claim about a position; every insertion above it falsifies that claim while
  leaving the sentence around it true, and nothing but the gate below reads
  comment text, so an unenforced claim decays with no failure signal.
- `tests/citation-symbol-form-gate.test.ts` holds the converted-file list and
  enforces the adjacent form in full: no converted file is cited with a line
  number — `path:<line>` or `"path":<line>` — and every citation of one resolves
  to a symbol that file declares or carries (a spec-row or REQ-ID token locates a
  construct as precisely as a function name). A citation continued as a bare
  `:<line>` is enforced to the attribution rule below; a continuation the rule
  attributes to no file at all is counted, and the count is pinned so the
  residual is visible and cannot grow unseen. The list is a ratchet — a file
  enters it when its citing sites have been swept, and never leaves.
- A citation continued as a bare `:<line>` is judged by the file the surrounding
  prose attributes it to: its enclosing comment paragraph, then the enclosing
  block, then — for a citation inside an assertion message — the concatenated
  string run it sits in. A continuation whose antecedent is another file belongs
  to that file at every one of those scopes, so write the file name beside the
  number when the antecedent is ambiguous. A run that line-cites no file but
  backticks a symbol declared at module scope in exactly one converted file, and
  in no other module under `src/**`, continues that file.
- A line number stays legitimate where the target has no symbol to name: a spec
  sentence, a reference page, a fixture row. Such a citation is a claim about the
  HEAD that measured it.
- `docs/bugs/**` is outside the gate in both directions. A bug document is a
  dated record of one HEAD and its citations are not rewritten; a reader
  resolving a stale position in a bug report reads by symbol.

## Terminology

The authority is `docs/spec_topics/glossary.md`. Terms including *callable set*,
*operator*, *query-terminating*, *final value*, *prompt mode*, *subagent mode*,
`.theta`, `.thetalib` must match the glossary exactly. Do not coin synonyms.

## Examples

- Every non-trivial example is a real, checked-in file under `docs/examples/`.
- Examples parse under CI automatically (the committed-fixture parse gate walks
  `docs/`). Runtime-executed examples must run via `pi --theta docs/examples -p
  "/<stem>"` before the doc citing them is considered done.
- Docs reference the checked-in file; they do not paste a divergent copy.
- `.thetalib` modules are not invocable; exercise them through a `.theta` that imports
  them.

## Structure and cross-linking

- Follow the Diátaxis boundaries recorded in `docs/documentation-plan.md` §3.
  Do not mix modes (explanation vs. tutorial vs. how-to vs. reference).
- Link into the Reference for definitions instead of re-deriving them.
- One document has one job. If a section is doing a different job, it belongs in
  a different document.

## Provenance (delivery requirement)

Every delivered document ends with a `## Provenance` section (kept in the doc
during drafting; the editor decides whether it ships): the spec pages / REQ-IDs /
source files the document draws on, and the origin of each non-trivial claim.
This is what makes editor review cheap.
