# Bug 0069 — A `tools:` entry's trailing residue is discarded with no diagnostic: a missing comma in the short form silently drops every entry after the first, and `read as` / `read as file_read junk` / a non-scalar list item load clean

- **Status:** open.
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
  this batch.

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
