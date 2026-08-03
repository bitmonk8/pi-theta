# Bug 0069 — A `tools:` entry's trailing residue is discarded with no diagnostic: a missing comma in the short form silently drops every entry after the first, and `read as` / `read as file_read junk` / a non-scalar list item load clean

- **Status:** fixed (0.62.0). The per-entry grammar is closed — an entry outside
  it raises `theta/load/malformed-tool-entry` and the theta does not register —
  and a non-scalar sequence item is recovered as its own verbatim source and
  judged by that same grammar rather than dropped. See §Fix (0.62.0) below.
- **Kind:** spec gap — `frontmatter-fields-a.md` §`tools` states the per-entry
  grammar (`<spec>` plus an optional `as <name>` clause) but prescribes no
  disposition for text past the end of that grammar, and the implementation
  consumes it silently. The observable effect is a narrowed callable set the
  author never declared.
- **Related:**
  - 0042 (`schema X = Cat Cat` — same-line residue after a grammatically
    complete right-hand side consumed with no diagnostic) — identical shape at a
    different surface; that report's residue is inside a `schema` declaration,
    this one is inside a `tools:` entry, and the two are parsed by different code
    (`parseAliasRhs` vs `parseEntry`, `src/parser/callable-set.ts:275`).
  - 0001 (extension tools unreachable) — established that the callable set is the
    sole door for both code-side and model-facing reach, which is why a silently
    narrowed set is not recoverable at query time.
- **Affected:**
  - `src/parser/callable-set.ts:275–279` (`parseEntry` — the whitespace split
    that keeps only `parts[0]` / `parts[2]`),
  - `src/parser/frontmatter.ts:410–427` (`extractToolsList` — the short form
    splits on commas only; a non-scalar sequence item is skipped at `:421`),
  - `src/extension/production-composition.ts:1481` (the production load path
    feeds `parseEntry` verbatim: `tools: { kind: "list", items: toolsList }`).
- **Observed at:** `0.52.0` (`d06daae3`), Windows. Offline, through the shipped
  production load path (`discoverAndComposeFixtures`, the `session_start`
  composition root) over a real on-disk `.pi/theta/` discovery workspace — the
  harness pattern of `tests/production-tools-load-resolution.test.ts`.

## Fix (0.62.0)

The §Fix below is constraint-pinned but leaves the route open ("Not yet
decided", five constraints plus one rejected alternative). The route settled
inside those constraints, and the settlement is recorded here. Line anchors are
at the fix commit.

**Route settled.** One new code, `theta/load/malformed-tool-entry` (E, load),
for one rule: the per-entry grammar is closed and admits exactly two token
shapes. The alternative §Fix rejects — treating a whitespace-separated entry as
multiple entries — is absent: entries are never split on whitespace into
several entries, `./a.theta as b` still parses as one spec plus one rename, and
the short form's comma stays load-bearing.

**Reproduction re-derived at the fix baseline** (`125d3691`, 0.61.0), offline
over a real on-disk `.pi/theta/` workspace through `discoverAndComposeFixtures`
— a scratch vitest on the `tests/production-tools-load-resolution.test.ts`
harness, written, run, deleted:

```
REGISTERED: ["asresidue","ctlcomma","danglingas","goodrename","mapitem",
             "nocommaq","seqitem","threenoas","twotoken"]
NOTIFICATIONS: [
 "bare object literal not permitted in this position; name the schema (Schema { ... })",
 "unknown identifier 'grep'"
]
```

Every residue theta registered; the only absent stem was the paired `nocomma`
cell, absent for the downstream body reason §Reproduction records, not for a
`tools:` reason. No notification named a `tools:` entry. **Citation drift:
none** — every path:line §Affected and §Actual behaviour cite was exact at the
fix baseline (`callable-set.ts:275`, `:170`, `:186`;
`frontmatter.ts:410–428` with the skip at `:421`;
`production-composition.ts:1401` / `:1481`;
`production-theta-producer.ts:3595` with the fallback body at `:3600–3607`).

- What shipped:
  - `src/parser/callable-set.ts` — `parseEntry` became the exported
    `parseToolsEntry` returning a discriminated `ToolsEntryParse`; the grammar
    admits exactly one token (bare spec) or three tokens with `as` in the
    middle, and every other token count is `malformed` (constraint 1). The
    two-token dangling `as` is malformed rather than falling into the no-rename
    arm (constraint 2). `resolveCallableSet` raises the error-severity
    `theta/load/malformed-tool-entry` naming the entry verbatim and continues,
    so the existing all-or-nothing `registered` computation un-registers the
    theta on the same footing as `theta/load/unknown-tool`. The grammar check
    runs BEFORE the `as`-target validation, so `read as MyTool` still reaches
    `theta/load/invalid-tool-rename` (§Non-goals) while `read as MyTool junk`
    is malformed first.
  - `src/parser/frontmatter.ts` — `extractToolsList` stopped skipping a
    non-scalar sequence item; the item recovers its own verbatim YAML source
    slice through the existing `paramValueSource` helper (the same recovery
    frame bug 0041 established for the `params:` side), with the frontmatter
    block's raw YAML text threaded in explicitly, so the closed grammar judges
    it instead of it being dropped below the resolver (constraint 3).
  - `src/extension/production-theta-producer.ts` — `presentedCallableNames`'
    snapshot-absent fallback consumes the exported `parseToolsEntry` and its
    duplicated whitespace split is deleted; a malformed entry has no presented
    name and contributes nothing (constraint 5 — the lock-step is closed by
    sharing the grammar, not by mirroring it).
  - `docs/spec_topics/diagnostics/code-registry-load.md` — the new row,
    immediately before `theta/load/unknown-tool` (constraint 4).
  - `docs/reference/diagnostics.md` — the mirror row, same relative position.
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md` — the new code
    added to §7's parse-time literal-value `<value>` enumeration. No new
    placeholder, no retirement, no category move, so
    `placeholder-rendering-a.md` §Closure is untouched and GOV-7 / GOV-8 are
    not engaged beyond the registry row itself.
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md` — the §`tools`
    closed-grammar sentence (constraint 4).
  - `docs/reference/frontmatter.md` — the same statement in the mirror's
    "Two entry kinds" block.
  - `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md` — the
    new code added, first, to the §`tools` rejection-family enumeration whose
    posture it shares.
  - `tests/tools-entry-closed-grammar.test.ts`,
    `tests/tools-entry-closed-grammar-lockstep.test.ts` — new witnesses
    (31 cells).
- Gates:
  - Witness run — `npx vitest run tests/tools-entry-closed-grammar.test.ts
    tests/tools-entry-closed-grammar-lockstep.test.ts`: baseline
    `Tests 21 failed | 10 passed (31)` → post-fix `Tests 31 passed (31)`.
  - Full default suite — `npm test`: `Test Files 253 passed (253)` /
    `Tests 3574 passed (3574)` (baseline 251 / 3543; the delta is exactly the
    two new witness files and their 31 cells).
  - `npm run typecheck` — clean, no output.
  - `npm run lint` — clean, no output.
  - Live — H8a `tests/live/live-production-acceptance.test.ts` `7 passed (7)`;
    H9a `tests/live/acceptance/` `11 passed (11)`. Both run for real against a
    live model; no 0064 / 0065 signature and no stochastic stall occurred.
- Review: 1 round.
  - Round 1 (`bug-fix-reviewer`) — `DEFECTS: 1` plus four recorded residuals.
    The defect was a born-stale spec anchor in the witness header (the new
    registry row lands AT the line the header cited). Orchestrator review of
    the same diff added three more prose defects the round missed: the witness
    header naming `parseEntry` at a line that no longer holds it, the
    `extractToolsList` doc comment narrowed to "absent field" when the
    whole-field non-scalar shape also returns `undefined`, and the §`tools`
    rejection-family enumeration in `frontmatter-fields-b-and-templates.md`
    omitting the new member. All four discharged by one
    `bug-fix-fixer-light` round; every hunk in that round touches only a
    comment, a doc comment, or `docs/` prose, and the orchestrator's own gate
    re-run stayed green — polish verified by gate-diff, confirmation round
    skipped.
- Verification: `VERDICT: PASS`, all four obligations discharged with quoted
  evidence.
  - Witness genuinely witnesses — each of the three source seams neutralised
    alone and all three together, by targeted byte edit, never `git stash` and
    never a path checkout. Seam 1 alone reds 17/31, seam 2 alone reds the two
    constraint-3 cells, seam 3 alone reds the two constraint-5 cells, all three
    together red 20/31 (the set-union — the seams compose additively with no
    masking). Every red is the bug's symptom (the malformed theta back in the
    registered set, or no notification naming the entry text), never a compile
    error. All five files restored byte-exact and blob-hash verified
    (`4ab6ee3d…`, `b692a982…`, `1ba32ad5…`, plus the two untracked witnesses,
    never edited).
  - Full default suite, typecheck and lint — green, quoted above.
  - Live end-to-end over the fixed path — H8a and H9a both green. Coverage of
    the fixed path already existed and no live cell was added: H9a area (f)
    (`tests/live/acceptance/noninteractive-acceptance.test.ts`) drives
    `/acc-code-tool-loop` through a genuinely spawned `pi` binary, and that
    fixture's `tools:` entry must parse through `parseToolsEntry` →
    `resolveCallableSet` → registration for the run to exit 0 at all.
  - The `permitted-codes.json` question decided by the live run, not by
    assumption: **do not append.** Every `tools:` entry in H9a's reach was
    enumerated (only `acc-code-tool-loop.theta` carries `tools:` at all, a
    single-token `- read`; the other nine acceptance fixtures and every
    runtime-authored theta carry no `tools:` field; `tests/fixtures/h7a/`
    contributes only `permitted-codes.json` to H9a, its `.theta` sibling being
    offline-only), and the H9a run's `assertCodesSubsetOfPermitted` +
    `assertStderrClean` passed on all 11 areas with the new code absent from
    every capture. `tests/fixtures/h7a/permitted-codes.json` is unedited.
- Residuals:
  1. **A whole-field non-scalar `tools:` value still loads silently.**
     `extractToolsList`'s final `return undefined` (`src/parser/frontmatter.ts`)
     covers a `tools:` VALUE that is neither a scalar nor a sequence — a flow or
     block mapping — so `tools: {a: b}` is treated as an absent field and the
     theta registers with the empty callable set, no diagnostic. Same hazard
     class one level up; out of scope here because §Fix constraint 3 names the
     *sequence item* and §Reproduction's input table contains only `- {a: b}`.
     Evidence: reviewer finding R1, `src/parser/frontmatter.ts:436` →
     `src/extension/production-composition.ts:1402–1410`; the doc comment on
     `extractToolsList` now states this contract explicitly.
  2. **A multi-line recovered slice embeds a raw newline in the rendered
     message.** A block-mapping sequence item of two or more keys (`- name:
     read` / `    as: file_read`) recovers a slice containing `\n`, which the
     `<value>` interpolation carries into a `message` that
     `diagnostics/diagnostic-shape.md:34` describes as a single-line summary.
     The hazard class pre-exists in the same placeholder sub-rule (a block
     scalar `mode: |` value reaches `renderScalarValue` the same way); this
     fix's verbatim-slice recovery widens its reachability. Evidence: reviewer
     finding R2, `src/parser/callable-set.ts:191`.
  3. **Three same-shape entry-grammar derivations remain outside the
     lock-step.** `toolsEntrySpec`
     (`src/extension/production-composition.ts:1584`) and `toolCallableName` /
     `piToolCallableName` (`src/parser/theta-document.ts:4506` / `:4825`) each
     re-derive a spec or a presented name from an entry with their own
     whitespace split. §Fix constraint 5 names only `presentedCallableNames`,
     and none of the three can contradict the load observable because a
     malformed entry un-registers the theta outright. One visible corner:
     the pre-parse callee cache derives specs from malformed entries too, so a
     malformed entry whose first token names an existing erroneous `.theta` can
     co-fire `theta/load/callee-has-errors` alongside the grammar rejection —
     the un-registration outcome is unchanged. Evidence: reviewer finding R3.
  4. **The constraint-5 witness is a source-shape gate.**
     `tests/tools-entry-closed-grammar-lockstep.test.ts` group (D1) asserts
     that `presentedCallableNames`' body carries no `split(` and no quoted
     `as`, because the function is module-private with no cheap behavioural
     observable (its only reach is a full bind-and-execute producer drive whose
     observable is the environment's callable registry, not the name list). It
     reds correctly against the pre-fix body — verified by neutralisation — but
     a novel re-tokenisation (`match(/\S+/g)`, `includes(" as ")`) would evade
     it. Reshape only if a behavioural observable appears. Evidence: reviewer
     finding R4(a), verification round 3.
- Discharge notes appended: none.
- Pinned dispositions / non-goals:
  - A non-scalar sequence item whose recovered slice is a single token (`[a]`,
    `{a:b}`) is not malformed by token count and is not a bare identifier, so it
    falls to `theta/load/unresolvable-theta-path`. Still error-severity, still
    un-registers — a loud rejection under a neighbouring code, deliberately not
    forced onto the new one.
  - A YAML node carrying no `range` would recover the empty string and be
    filtered as an empty entry. Unreachable: every node `parseDocument`
    produces carries CST offsets, so no defensive dead code was added.
  - §Non-goals held: the entry grammar is not widened;
    `theta/load/invalid-tool-rename` is untouched and still fires for
    `read as BadName`; the derived-default-name shape gap for `.theta` entries
    (bug 0070) is untouched — `thetaDefaultName` and `thetaCallableName` are
    byte-unchanged.
  - **For the bug 0070 orchestrator, which runs next.** 0070 edits the same
    region of `src/parser/callable-set.ts`. What moved here: `parseEntry` /
    `interface ParsedEntry` are gone, replaced by the exported
    `parseToolsEntry` returning the exported `ToolsEntryParse`
    (`{ kind: "ok", spec, rename? } | { kind: "malformed" }`);
    `resolveCallableSet`'s per-entry loop gained a leading malformed-arm block
    before the `as`-target check; `thetaDefaultName`, `isBareIdentifier`,
    `isLowercaseFirstIdentifier`, `resolveEntry` and `splitEntries` are
    byte-unchanged. `src/parser/frontmatter.ts`'s `extractToolsList` gained a
    second parameter (`yamlSource`). The witness surface 0070 should extend is
    `tests/tools-entry-closed-grammar.test.ts` — groups (A) registry, (B)
    production-load matrix, (C) resolver-direct token boundary — and
    `tests/tools-entry-closed-grammar-lockstep.test.ts` groups (D1) source-scan
    and (D2) presented-name derivation, the latter of which pins
    `./code-review.theta` → `code_review` and will interact with 0070's
    derived-name validation. `tests/production-tools-load-resolution.test.ts`
    and `tests/callable-set.test.ts` are byte-unchanged by this fix.
  - The `theta/load/malformed-tool-entry` rejection mirrors bug 0042's posture
    for `theta/parse/malformed-alias-rhs`: a grammatically complete construct
    followed by residue is rejected outright rather than truncated, under a new
    registered code landed in the same commit as its spec sentence. 0042's
    surfaces are untouched.

## Summary

`frontmatter-fields-a.md` §`tools` defines a `tools:` entry as a Pi-tool name or
a `.theta` path, with an optional `as <name>` rename. `parseEntry`
(`src/parser/callable-set.ts:275`) implements that grammar by splitting the entry
on whitespace and reading `parts[0]` as the spec and `parts[2]` as the rename
when `parts[1] === "as"`. Every other token is discarded without inspection and
without a diagnostic.

Four author-reachable inputs land there:

| Input | Callable set produced | Diagnostics |
|---|---|---|
| `tools: read grep` (comma omitted in the short form) | `{read}` | none |
| `- read bash` (two names, no `as`) | `{read}` | none |
| `- read as` (dangling `as`) | `{read}` | none |
| `- read as file_read junk_here` | `{file_read}` | none |
| `- {a: b}` (non-scalar list item) | entry dropped | none |

In every row the theta registers and runs with a callable set the author did not
write. The short-form row is the load-bearing one: `tools:` is documented with a
comma-separated short form (`tools: read, grep, bash`), so a dropped comma is a
one-character typo that silently removes tools from both the model's active set
and theta code's callable set.

## Reproduction

Offline, against the shipped composition root. Plant these under
`<workspace>/.pi/theta/` and run `discoverAndComposeFixtures(pi, ctx)` with
`ctx.cwd = <workspace>` (the `tests/production-tools-load-resolution.test.ts`
harness verbatim; `ctx.ui.notify` collects error-severity diagnostics).

`nocommaq.theta` — the comma omitted, body uses only the first name:

```theta
---
mode: prompt
tools: read grep
---
let r = read({ path: "x" })?
r
```

`danglingas.theta`:

```theta
---
mode: prompt
tools:
  - read as
---
let r = read({ path: "x" })?
r
```

`asresidue.theta`:

```theta
---
mode: prompt
tools:
  - read as file_read junk_here
---
let r = file_read({ path: "x" })?
r
```

`twotoken.theta` (`  - read bash`) and `mapitem.theta`
(`  - read` / `  - {a: b}`) follow the same shape.

Observed registration set (verbatim from the run):

```
REGISTERED: ["2fast","asresidue","ctlcomma","danglingas","digitcallee",
             "mapitem","nocommaq","twotoken"]
NOTIFICATIONS: ["unsupported syntactic feature: 2fast",
                "unsupported syntactic feature: stray '?' in statement position",
                "unknown identifier 'grep'",
                "bare object literal not permitted in this position; …"]
```

Every residue theta registered. No notification names a `tools:` entry.

The witness that `grep` really left the callable set is the paired cell
`nocomma.theta` — the same `tools: read grep` frontmatter with a body that calls
`grep({ pattern: "x", path: "." })?`. It is the only one of the pair that fails,
and it fails downstream, at the body:

```
nocomma.theta:5:9: theta/parse/unknown-identifier: unknown identifier 'grep'
nocomma.theta:5:14: theta/parse/bare-object-literal: bare object literal not permitted …
```

The control `ctlcomma.theta` (`tools: read, grep`, same body) registers.

## Expected behaviour

- `docs/spec_topics/frontmatter/frontmatter-fields-a.md:~78` (§`tools`) admits
  exactly two entry kinds — a Pi-tool name and a `.theta` path — and one
  modifier: "The `as <name>` clause overrides the default for either kind". No
  production admits a third token, and no rule says a trailing token is ignored.
- The same section states the two YAML spellings are interchangeable
  (`docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md`
  §YAML-shape: the plain scalar split on commas). Under that equivalence
  `tools: read grep` is not a spelling of `tools: [read, grep]`; it is a shape
  the grammar does not describe.
- The corpus already rejects malformed `tools:` entries loudly elsewhere:
  `theta/load/invalid-tool-rename` fires for an `as` target that is not
  lowercase-first (`src/parser/callable-set.ts:183`), and
  `theta/load/unknown-tool` un-registers the whole theta for one unresolvable
  name. A silently-dropped name is treated more permissively than a misspelled
  one.
- The spec is silent on residue. That silence is what makes this a spec gap
  rather than a defect: no registered code covers it, so the fix needs a spec
  addition (see **Fix**).

## Actual behaviour / root cause

`src/parser/callable-set.ts:275–279`:

```ts
function parseEntry(raw: string): ParsedEntry {
  const parts = raw.split(/\s+/).filter((p) => p.length > 0);
  const rename = parts.length >= 3 && parts[1] === "as" ? parts[2] : undefined;
  return rename !== undefined ? { spec: parts[0] ?? "", rename } : { spec: parts[0] ?? "" };
}
```

`parts.length` is never compared against the shape consumed (2 with a rename +
1 without), `parts[1]` is not required to be `as` when more tokens follow, and a
lone trailing `as` (`parts.length === 2`) falls into the no-rename arm. The
caller (`resolveCallableSet`, `:170–210`) then resolves `parsed.spec` and moves
on; the discarded tokens are unreachable from that point.

The short-form path adds the second half: `extractToolsList`
(`src/parser/frontmatter.ts:410`) splits a plain scalar on commas only — its own
doc comment records the intent ("Entries are split ONLY on commas — the
whitespace split that separates an `as` rename … happens later in the per-entry
grammar") — so `read grep` arrives at `parseEntry` as one entry and loses its
second name there. The sequence path (`:421`) drops any item that is not a YAML
scalar with no diagnostic at all.

Production wires exactly this: `production-composition.ts:1481` passes
`{ kind: "list", items: toolsList }` where `toolsList` is
`parsed.frontmatter.tools` (`:1401`), i.e. `extractToolsList`'s output.

## Why it matters

- **The declared callable set is the theta's only tool boundary** (bug 0001,
  §"The callable set is the only door"). A name that never enters it is
  unreachable from the model *and* from theta code, for the whole invocation.
- **The failure is invisible when the dropped tool is model-facing only.** A
  code-side call of the dropped name is caught downstream by
  `theta/parse/unknown-identifier` (`nocomma` above). A theta that lists tools
  for its `@`-query to use — the common case — has no such body reference, so
  the theta registers, runs, and the model is simply never offered the tool. The
  observable is a worse model answer, attributed to the model.
- **One character.** `tools: read, grep, bash` → `tools: read grep, bash` keeps
  `bash` and loses `grep`.
- The `as`-residue rows (`read as file_read junk_here`) additionally accept a
  name the author did not intend to be complete, which is the same hazard class
  bug 0042 records for `schema X = Cat Cat`.

## Non-goals

- Widening the entry grammar (multiple names per entry, quoted names with
  spaces) — that is a frontmatter design change, not a fix for silent
  acceptance.
- The `as`-target validation rule itself (`theta/load/invalid-tool-rename`),
  which is correct and already enforced.
- The derived-default-name shape gap for `.theta` entries — a separate report in
  this batch. Discharged by the 0070 fix (0.63.0): `resolveCallableSet` now
  applies the lowercase-first predicate to the merged presented name, after
  `resolveEntry` returns `defaultName` and before the collision test, raising
  `theta/load/invalid-derived-tool-name` for the derived case. The malformed-arm
  block this fix added is untouched by it.

## Fix

Not yet decided. Constraints any fix must satisfy:

1. `parseEntry` must reject, not truncate: an entry whose token count is not 1
   (bare spec) or 3-with-`as` must raise an error-severity load diagnostic
   naming the entry text verbatim, and the theta must not register — matching
   the existing all-or-nothing posture of `theta/load/unknown-tool`.
2. The dangling `as` (`parts.length === 2 && parts[1] === "as"`) must not fall
   into the no-rename arm; it is a truncated rename, not an entry without one.
3. A non-scalar sequence item (`src/parser/frontmatter.ts:421`) needs its own
   disposition — today it is dropped before the resolver ever sees it, so a
   diagnostic emitted only in `callable-set.ts` cannot cover it.
4. The new code needs a registry row in
   `docs/spec_topics/diagnostics/code-registry-load.md` plus the
   `docs/reference/diagnostics.md` mirror, and a sentence in
   `frontmatter-fields-a.md` §`tools` stating the entry grammar is closed —
   without it the implementation would be enforcing a rule the spec does not
   state.
5. `presentedCallableNames`' snapshot-absent fallback
   (`src/extension/production-theta-producer.ts:3600–3607`) re-implements the
   same grammar for harness fixtures; it must move in lock-step or it will
   disagree with the resolver about which entries exist.

An alternative that avoids a new code — treating a whitespace-separated entry as
multiple entries — is rejected here: it changes `./a.theta as b` parsing and
makes the short form's comma decorative.

## Provenance

- Spec measured against:
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md` §`tools` (entry kinds,
  naming rules, `as` clause), `frontmatter-fields-b-and-templates.md`
  §YAML-shape / §Resolution snapshot, `docs/spec_topics/glossary.md`
  (*callable set*), `docs/spec_topics/tool-calls.md` (opening paragraph — the
  callable set is shared by the model-driven and code-driven call paths),
  `docs/spec_topics/diagnostics/code-registry-load.md` (the five `tools:`
  rejections; none covers residue).
- Implementation: `src/parser/callable-set.ts` (`parseEntry`,
  `resolveCallableSet`), `src/parser/frontmatter.ts` (`extractToolsList`),
  `src/extension/production-composition.ts:1401–1481`.
- Evidence: offline production-load matrix (this report §Reproduction) run at
  `d06daae3` via a scratch vitest on the
  `tests/production-tools-load-resolution.test.ts` harness; scratch deleted.
