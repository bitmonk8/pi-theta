# Bug 0104 — A `tools:` field whose VALUE is a YAML mapping rather than a scalar or a sequence is treated as an absent field: `extractToolsList` returns `undefined`, the theta registers with the EMPTY callable set, and no diagnostic is emitted at any severity — so `tools: {read: bash}` and `tools:` over an indented `read: bash` both name `read` in the author's text and deliver a theta whose model cannot call it and whose code raises `theta/parse/unknown-identifier` on it

- **Status:** fixed (0.127.0). §Fix's open axis — whether the existing
  `theta/load/malformed-tool-entry` row's *Trigger* widens to the field-level
  shape or a distinct code is added — was adjudicated in the run and is
  recorded in `## Fix (0.127.0)` below: a distinct code,
  `theta/load/malformed-tools-field`, emitted at the frontmatter layer. Widening
  the *Trigger* was rejected on the DIAG-4 grounds constraint (a) itself names as
  decisive. No ordering dependency:
  [0069](./0069-tools-entry-residue-silently-dropped.md) shipped in 0.62.0 and
  its closed per-entry grammar is the rule this report measures the field level
  against.
- **Sev/Diff estimate:** S1/D3 — the callable set silently empties on an input
  the spec's two YAML spellings exclude, and the failure is attributed to the
  model (no code-side reference) or to the body (a `theta/parse/unknown-identifier`
  naming a tool the author declared); D3 because the registry disposition is
  adjudicated in-run, though narrowly — the emission point, the posture and the
  spec-edit set are settled by 0069's frame, and the fix is confined to the
  frontmatter layer plus one registry row and its mirrors.
- **Kind:** defect — an unenumerated YAML node kind at the field level collapses
  onto the field's absent case. `extractToolsList`
  (`src/parser/frontmatter.ts:418–439`) enumerates two node kinds (`isScalar`
  `:419`, `isSeq` `:426`) and returns `undefined` for every other
  (`:438`). `parseFrontmatter` records `tools` only when that result is defined
  (`:1240`), and `resolveThetaToolsAtLoad` treats `undefined` as "no `tools:`"
  and returns `EMPTY_CALLABLE_SET` before `resolveCallableSet` is called
  (`src/extension/production-composition.ts:1401–1410`). The two states are
  therefore indistinguishable downstream, and the resolver — the sole owner of
  every `tools:` rejection — never sees the field.
- **Related:**
  - [0069](./0069-tools-entry-residue-silently-dropped.md) — **fixed (0.62.0)**,
    the parent and the filing origin. This is its §Fix *Residuals* item 1: "A
    whole-field non-scalar `tools:` value still loads silently … Same hazard
    class one level up; out of scope here because §Fix constraint 3 names the
    *sequence item* and §Reproduction's input table contains only `- {a: b}`".
    The fix report that residual was distilled from adds the disposition the bug
    doc omits: "**Worth filing** — it is the last silent-narrowing path on the
    `tools:` surface" (`.pi/tmp/fixes/0069-report.md:305–306`). 0069
    closed the per-ENTRY grammar, including a non-scalar sequence ITEM, by
    recovering the item's verbatim YAML source and feeding it to the shared
    grammar; the whole-FIELD shape was outside that scope. Its fix also made
    the gap explicit in the source rather than silent: `extractToolsList`'s doc
    comment now states the contract (quoted in §Actual behaviour / root cause).
  - [0001](./0001-extension-tools-unreachable.md) — **fixed (0.11.0)**.
    §"The callable set is the only door — for code and for queries" establishes
    that the prompt-mode query-time loop installs exactly the theta's callable
    set as the model's active tools for the query window with no union of the
    ambient session snapshot, so a name absent from the callable set is absent
    from the model's active set too. A silently emptied set is not recoverable
    at query time.
  - [0042](./0042-schema-decl-same-line-residue-silent.md) — **fixed (0.52.0)**.
    The posture 0069 cites for its own code: a grammatically complete construct
    followed by residue is rejected outright rather than truncated, under a new
    registered code landed in the same commit as its spec sentence. The same
    posture governs the disposition here.
  - [0070](./0070-theta-callable-default-name-unvalidated.md) — the
    derived-default-name gap on the same `tools:` surface (open at filing time;
    it may have shipped by the time this is read). Disjoint input class: 0070's
    inputs are well-formed sequence or scalar entries whose derived name is
    unspellable, this report's input never produces an entry at all.
- **Affected** (every citation verified at HEAD `99b65438`, 0.62.0):
  - `src/parser/frontmatter.ts:418–439` — **the site.** `extractToolsList`'s
    two arms are `isScalar(node)` (`:419–425`, the comma short form) and
    `isSeq(node)` (`:426–437`, one entry per item, with 0069's per-item
    verbatim-source recovery at `:434`). `:438` is the final `return undefined`
    that a flow mapping, a block mapping, and every other node kind reach. 0069
    cites this line as `:436` (its fix report marks that a pre-commit line); at
    HEAD it is `:438`, the same two-line delta the doc comment's whole-field
    sentence occupies.
  - `src/parser/frontmatter.ts:398–417` — the doc comment 0069's fix added,
    which states the contract at `:406–410`.
  - `src/parser/frontmatter.ts:915–921` — the `tools` arm of the frontmatter
    key walk. It calls `extractToolsList` (`:919`) and records nothing else: no
    presence flag, no value range. `:832` declares the only local
    (`toolsValue`), and `:1240` spreads `tools` into the returned frontmatter
    only when it is defined. Contrast `params`, whose arm records
    `paramsPresent` and `paramsRange` (`:902–907`) so `:1095–1109` can raise
    `theta/load/params-null` against a present-but-unusable field.
  - `src/parser/frontmatter.ts:155` — `ParsedFrontmatter.tools`, documented
    "Present iff the theta declares a non-empty `tools:` field" (`:148–154`).
    The field IS declared for a mapping value; the property is absent.
  - `src/extension/production-composition.ts:1401–1410` — **the consumer.**
    `resolveThetaToolsAtLoad` reads `parsed.frontmatter.tools` (`:1401`) and
    early-returns `{ diagnostics: [], callableSet: EMPTY_CALLABLE_SET }` when it
    is `undefined` (`:1402–1410`), under the comment "No `tools:` → the empty
    callable set". `EMPTY_CALLABLE_SET` is the frozen empty map at `:1378–1380`.
    `resolveCallableSet` is called at `:1479–1483` with
    `tools: { kind: "list", items: toolsList }` (`:1481`) and is unreachable on
    this input.
  - `src/parser/callable-set.ts:173–197` — `resolveCallableSet` and 0069's
    malformed arm. `splitEntries` (`:278–290`) is driven from a `ToolsField`
    whose three arms are `absent` / `scalar` / `list` (`:45–48`); the type has
    no arm for a field present with an unusable shape, and all three arms
    produce zero diagnostics on an empty input (measured in §Reproduction).
    `:189–197` is the `theta/load/malformed-tool-entry` push, whose message
    template is at `:194` and which carries no `range`.
  - `src/parser/callable-set.ts:292–316` — `parseToolsEntry`, the closed
    per-entry grammar 0069 landed. Its doc comment (`:292–306`) states the
    grammar the field-level shape never reaches.
  - `src/parser/theta-document.ts:4553–4563` — `collectIdentRoots`' frontmatter
    arm: `for (const entry of frontmatter.tools ?? [])` (`:4557`) seeds the
    whole-file identifier root scope with each entry's presented name. An
    `undefined` `tools` seeds nothing, which is why a body reference to a
    declared name draws `theta/parse/unknown-identifier`.
  - `src/parser/theta-document.ts:5196–5212` — `checkLexicalCallSites`' `piTools`
    and `callables` sets, built from the same `frontmatter?.tools ?? []`
    (`:5203`). Both stay empty.
  - `src/parser/theta-document.ts:933–960` — `resolveSubagentSessionConfig`, the
    FN-7 inheritance path. `if (frontmatter?.tools !== undefined)` (`:958`) is
    the whole test, so a `subagent fn` with no `with { tools: … }` override
    inherits the empty callable set from a mapping-valued field on the same
    footing as from an absent one.
  - `src/extension/production-theta-producer.ts:3600–3620` —
    `presentedCallableNames`, whose snapshot-absent fallback iterates
    `theta.frontmatter.tools ?? []` (`:3606`) through `parseToolsEntry`
    (`:3607`). Production takes the snapshot arm, and the snapshot is
    `EMPTY_CALLABLE_SET`; both arms answer "no presented names".
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md:74` (§`tools`) — the
    field's definition and the empty-callable-set consequence of omitting it
    ("`tools: []` and an absent `tools:` field are equivalent"). `:76` — "Two
    kinds of entry are accepted", the closed list. `:78`, `:79` — the two entry
    kinds. `:81–86` — the naming rules and the `as` clause. `:88` — the sentence
    0069 added: "The per-entry grammar is closed: an entry is exactly a Pi tool
    name or a `.theta` path, optionally followed by an `as <name>` clause. Any
    other token sequence in an entry, and any `tools:` sequence item that is not
    a YAML scalar, is `theta/load/malformed-tool-entry` and the theta does not
    register." It closes the ENTRY and the sequence ITEM; the field-level value
    shape is unstated. `:43` — the field-contract row, which pins only the
    absent case ("`tools` | no | empty callable set | … `tools: []` and absent
    `tools:` are equivalent"). `:12` — the header example, `tools: read, grep, bash`.
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md:36`, `:39`, `:41` —
    the `mode`, `model` and `bind_context` field-contract rows, each of which
    states the missing-vs-present-but-bad split explicitly — `:36` reads
    `"missing" and "present-but-bad" do not collapse into one code, because the
    authoring intent differs`. No such split exists for `tools`.
  - `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:3`
    (§YAML-shape) — "`tools:` accepts two interchangeable spellings — a
    comma-separated short form and a YAML list form … The comma form is the YAML
    plain scalar split on commas … the list form takes one entry per sequence
    item." A mapping is neither. `:18` — the rejection-family enumeration 0069
    extended, which now leads with `theta/load/malformed-tool-entry` and states
    that every member "prevent[s] the theta from being registered".
  - `docs/spec_topics/diagnostics/code-registry-load.md:25` — the
    `theta/load/malformed-tool-entry` row. Its *Trigger* is written at entry
    granularity ("A `tools:` entry does not match the closed per-entry
    grammar … A `tools:` sequence item that is not a YAML scalar is recovered as
    its own verbatim source text and judged by this same grammar") and reaches
    no field-level shape. `:26` — `theta/load/unknown-tool`, whose *Trigger*
    carries the all-or-nothing sentence the new code's *Trigger* refers back to
    ("it un-registers the whole theta"). `:27–30` — the remaining `tools:`
    rejections (`unresolvable-theta-path`, `prompt-mode-callable`,
    `tool-name-collision`, `invalid-tool-rename`), all per-entry. `:38` —
    `theta/load/callee-has-errors`. `:18`, `:19` — `theta/load/params-null` and
    `theta/load/params-type-not-expression`, the two existing frontmatter-shape
    refusals and the closest precedent for a field-level shape rule. `:15` —
    `theta/load/unknown-frontmatter-field` (`W`), which fires for an unrecognised
    KEY and not for a recognised key's value shape (measured in §Reproduction).
    None of the load registry's 52 rows covers a `tools:` value that is neither
    a scalar nor a sequence.
  - `docs/reference/diagnostics.md:188` — the user-facing mirror row for
    `theta/load/malformed-tool-entry` (no *Trigger* column there).
  - `docs/reference/frontmatter.md:105–192` (§`tools:` (callable set)) — the
    mirror. `:117–131` the "Two entry kinds" block, `:134–137` the closed-grammar
    statement 0069 added, `:179–181` the YAML-shape statement ("a
    comma-separated short form and a YAML list form"), `:51` the field-contract
    row. `:37–40` — the unknown-key policy, which routes an unrecognised key to
    a warning and leaves the theta registered.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2, the closed
    registry and its GOV-15 carve-out routing), `:74` (DIAG-4, the *Message*
    column is normative and a reword is deferred to theta 2.0), `:34` (`message`
    is a "single-line summary").
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md:74` — the
    parse-time literal-value `<value>` sub-rule, which already enumerates
    `theta/load/malformed-tool-entry`. A YAML scalar with no enclosing source
    quoting renders unquoted; a field-level rendering of a block mapping is
    multi-line, which is 0069 §Fix *Residuals* item 2's hazard.
  - `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
    (the loads-cleanly predicate — no diagnostic of effective severity `E`),
    `:25` (the diagnostic-registry carve-out, in scope for "inputs that did not
    previously emit the added code" and for a *Trigger* change "as an addition
    for inputs newly brought into the code's emission set").
  - `docs/spec_topics/glossary.md:15` (*callable set*) — "if `tools:` is omitted
    the theta runs with an empty callable set"; `:61` (*Pi tool* vs *`.theta`
    callable*). `docs/spec_topics/tool-calls.md:3` — "The same callable set is
    what the model sees during a `@`…`` query — the declaration is shared
    between the model-driven and code-driven call paths."
  - `tests/tools-entry-closed-grammar.test.ts` — 0069's witness. Group (B)'s
    `mapitem` cell (`:252–263`) is `tools:` over `  - read` / `  - {a: b}` — a
    non-scalar sequence ITEM. No cell in the file carries a mapping-valued
    `tools:` field, in either spelling.
  - `tests/production-tools-load-resolution.test.ts` — the harness pattern this
    report's probes reuse; its planted `tools:` values are scalars and sequences
    only.
  - **The corpus.** 34 committed `.theta` / `.thetalib` files
    (`rg --files --glob '*.theta' --glob '*.thetalib' .`). Fourteen carry a
    frontmatter `tools:` field: two scalar (`docs/examples/call-tool.theta:4`,
    `docs/examples/configure-tool-loop.theta:4`) and twelve sequence. One body
    `with { tools: [read, bash], … }` clause
    (`docs/examples/ralph-inline.theta:22`) is a theta-source flow array, not
    frontmatter YAML. Zero mapping-valued `tools:` fields, and zero in any
    TypeScript-literal fixture under `tests/`.
- **Observed at:** `0.62.0` (HEAD `99b65438`). Offline, deterministic; no live
  model, no provider. Three scratch vitest probes over the shipped
  `session_start` composition root (`discoverAndComposeFixtures`) against a real
  on-disk `<workspace>/.pi/theta/` discovery workspace — the
  `tests/production-tools-load-resolution.test.ts` harness pattern — plus direct
  `parseFrontmatter` and `resolveCallableSet` calls; written, run, deleted.

## Summary

`docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:3` gives
`tools:` two interchangeable spellings: a comma-separated plain scalar, and a
YAML sequence. `extractToolsList` (`src/parser/frontmatter.ts:418–439`)
implements exactly those two and returns `undefined` for every other node kind
(`:438`). A YAML mapping is another node kind, so both of these:

```yaml
tools: {read: bash}
```

```yaml
tools:
  read: bash
```

produce `frontmatter.tools === undefined`, which `resolveThetaToolsAtLoad`
(`src/extension/production-composition.ts:1401–1410`) reads as "no `tools:`" and
answers with `EMPTY_CALLABLE_SET`. The theta registers. No diagnostic is emitted
at any severity — measured, in both spellings, through the shipped composition
root.

The consequence follows 0001's finding that the callable set is the only door:
the model's active set for every query window is empty, and theta code has no
`<name>(...)` callable to resolve. What the author sees depends on whether the
body names one of the tools:

- **No code-side reference** — the theta registers and runs. The model is never
  offered the tool. The observable is a worse model answer.
- **A code-side reference** — the theta does NOT register, and the reason it
  gives names the body:
  `theta/parse/unknown-identifier: unknown identifier 'read'`, at the call site.
  The `tools:` field the diagnostic is really about is not mentioned.

0069 closed this hazard one level down. Its new code fires for a non-scalar
sequence ITEM: `tools:` over `  - {a: b}` raises
`theta/load/malformed-tool-entry: malformed 'tools:' entry '{a: b}'` and
un-registers the theta (measured). The same mapping written as the field's whole
value raises nothing, because the field never reaches `resolveCallableSet` — the
exact reachability problem 0069's §Fix constraint 3 recorded for the sequence
item, and solved there by recovering the item's verbatim YAML source through
`paramValueSource` and feeding it to the shared grammar.

## Reproduction

Offline, at `99b65438`. Plant one `.theta` per row under
`<workspace>/.pi/theta/` and run `discoverAndComposeFixtures(pi, ctx)` with
`ctx.cwd = <workspace>` (the `tests/production-tools-load-resolution.test.ts`
harness pattern). `registered` is the returned fixtures' `slashName` values;
`diags` is the rendered diagnostic line, collected off `ctx.ui.notify` (error
severity) and off the `!ctx.hasUI` stderr mirror
(`src/extension/production-composition.ts:190–210`, which carries every
severity). Bodies are either `` @`hi` `` (names no callable) or
`let r = read({ path: "x" })?` + `r` (names one).

### The field-level mapping value

```
@@ `tools: {a: b}`                    body @`hi`             registered ["r1"]   diags []
@@ `tools: {a: b}`                    body calls read        registered []
   diags ["r2.theta:5:9: theta/parse/unknown-identifier: unknown identifier 'read'",
           "r2.theta:5:14: theta/parse/bare-object-literal: bare object literal not permitted in this position; name the schema (Schema { ... })"]

@@ `tools:` + `  a: b`                body @`hi`             registered ["r3"]   diags []
@@ `tools:` + `  a: b`                body calls read        registered []
   diags ["r4.theta:6:9: theta/parse/unknown-identifier: unknown identifier 'read'", …]

@@ `tools:` + `  read: bash`          body calls read        registered []
   diags ["r5.theta:6:9: theta/parse/unknown-identifier: unknown identifier 'read'", …]
@@ `tools:` + `  read:`               body calls read        registered []
   diags ["r5b.theta:6:9: theta/parse/unknown-identifier: unknown identifier 'read'", …]

@@ `tools: {}`                        body @`hi`             registered ["emptyflowmap"]   diags []
@@ `tools:` + `  a:` + `    b: c`     body @`hi`             registered ["r15"]            diags []
@@ `tools: {read: 1, grep: 2}`        body @`hi`             registered ["r16"]            diags []
@@ `tools: {a: b}` with `mode: subagent`  body @`hi`         registered ["r13"]            diags []
@@ `tools: {./callee.theta: b}`       body calls callee      registered []
   diags ["r14.theta:5:9: theta/parse/unknown-identifier: unknown identifier 'callee'", …]
```

The `read: bash` and `read:` rows are the load-bearing ones: the author's text
contains the tool name, the theta's callable set does not, and the only
diagnostic names the body. The `./callee.theta` row shows the same for a
`.theta` callable — no `theta/load/unresolvable-theta-path`, no
`theta/load/prompt-mode-callable`, no resolution attempt at all.

### Controls — the two spellings the spec defines

```
@@ `tools: read`                      body calls read        registered ["r6"]   diags []
@@ `tools:` + `  - read`              body calls read        registered ["r7"]   diags []
```

Both bind the name. The mapping rows differ from these only in the field's YAML
node kind.

### Controls — the absent field and the shapes the spec equates to it

```
@@ no `tools:` field                  body @`hi`             registered ["r9"]   diags []
@@ no `tools:` field                  body calls read        registered []
   diags ["r8.theta:4:9: theta/parse/unknown-identifier: unknown identifier 'read'", …]
@@ `tools: []`                        body @`hi`             registered ["r10"]  diags []
```

The absent-field pair is identical in outcome to the mapping-value pair — same
registration verdict, same codes, same messages; the only difference is the body's
line number, one lower because the frontmatter is one line shorter.
`tools: []` is the equivalence `frontmatter-fields-a.md:74` states; the mapping
value is not.

### 0069's new code, and the field level it does not reach

```
@@ `tools:` + `  - {a: b}`            body @`hi`             registered []
   diags ["r11.theta: theta/load/malformed-tool-entry: malformed 'tools:' entry '{a: b}';
            expected a Pi tool name or a .theta path, optionally followed by an 'as' clause"]
@@ `tools: {a: b}`                    body @`hi`             registered ["r1"]   diags []
```

`theta/load/malformed-tool-entry` does not fire for any field-level mapping row
above — the field never reaches `resolveCallableSet`. The row that does fire
carries no `range` (`src/parser/callable-set.ts:189–195` pushes no range), so it
is reported file-level.

### The frontmatter layer, direct

`parseFrontmatter(src, "probe.theta")`, reading `.frontmatter?.tools` and
`.diagnostics`:

```
@@ flow map            tools=undefined     diags []
@@ block map           tools=undefined     diags []
@@ empty flow map      tools=undefined     diags []
@@ nested map 2 deep   tools=undefined     diags []
@@ scalar              tools=["read"]      diags []
@@ seq                 tools=["read"]      diags []
@@ seq of maps         tools=["{a: b}"]    diags []
@@ empty seq           tools=undefined     diags []
@@ absent              tools=undefined     diags []
@@ bare `tools:` key   tools=["null"]      diags []
@@ `tools: null`       tools=["null"]      diags []
```

Four mapping shapes, the absent field, and `tools: []` produce one value. The
`seq of maps` row is 0069's recovery: the item's verbatim source is carried as an
entry. The
two null rows show a scalar `null` passing through `String(node.value)` — those
reach the resolver and un-register loudly as
`theta/load/unknown-tool: unknown Pi tool 'null'` (measured), so the degenerate
neighbouring spelling is loud where the mapping is silent.

### The resolver's arms on an empty input

`resolveCallableSet({ file, tools, deps })` with a `deps` that resolves nothing:

```
@@ {"kind":"absent"}                  diags []   entries []
@@ {"kind":"list","items":[]}         diags []   entries []
@@ {"kind":"scalar","text":""}        diags []   entries []
```

`ToolsField` (`src/parser/callable-set.ts:45–48`) has no arm for a field present
with an unusable shape, and none of its three arms produces a diagnostic on an
empty input. A rejection cannot be sited inside `resolveCallableSet` without
changing what reaches it.

### The precedent shapes on the `params:` surface

```
@@ `params: null`      registered []       diags ["<file>:3:9: theta/load/params-null: 'params: null' is not permitted; omit 'params:' or use 'params: {}'"]
@@ `params: {}`        registered ["p4"]   diags []
@@ `toolz: read`       registered ["p5"]   diags ["<file>:3:1: theta/load/unknown-frontmatter-field: unknown frontmatter field 'toolz'"]
```

`theta/load/params-null` is an error-severity, ranged, field-level value refusal
emitted from `src/parser/frontmatter.ts:1095–1109` that un-registers the theta —
so the frontmatter layer is a reachable emission point for exactly the kind of
diagnostic this defect needs. `theta/load/unknown-frontmatter-field` is a
warning on an unrecognised KEY and leaves the theta registered; it is not the
rule for a recognised key's value shape.

## Expected behaviour

- **A `tools:` value the two spellings exclude is not silently the absent
  field.** `frontmatter-fields-b-and-templates.md:3` names exactly two
  spellings, "a comma-separated short form and a YAML list form", and
  `frontmatter-fields-a.md:76` closes the entry list to two kinds. A mapping is
  neither a plain scalar nor a sequence item, so no production admits it. The
  field-contract row (`frontmatter-fields-a.md:43`) states the empty callable
  set as the behaviour when the field is **absent**, and the equivalence it
  extends that to is `tools: []` — not "any value the extractor does not
  recognise".
- **Missing and present-but-bad do not collapse.** The same field-contract
  table states this principle explicitly three times: `mode` (`:36`) reads
  `"missing" and "present-but-bad" do not collapse into one code, because the
  authoring intent differs`; `model` (`:39`) reads `"absent" and
  "present-but-unresolvable" do not collapse into one behaviour`; `bind_context`
  (`:41`) closes with "mirroring the `mode:` recognised-key / unrecognised-value
  split". `tools:` is the field where they do collapse.
- **The `tools:` rejection family prevents registration.**
  `frontmatter-fields-b-and-templates.md:18` enumerates the seven `tools:`
  rejections and states that all of them "prevent the theta from being
  registered". A `tools:` field that cannot be read at all is a stronger failure
  than an entry with an unresolvable name, and it is the only one that registers.
- **The closed grammar 0069 published is closed at one level only.**
  `frontmatter-fields-a.md:88` states that "any `tools:` sequence item that is
  not a YAML scalar is `theta/load/malformed-tool-entry` and the theta does not
  register". A mapping written as one sequence item is refused; the same mapping
  written as the field's whole value is not. The registry *Trigger*
  (`code-registry-load.md:25`) is written at the same entry granularity, so a
  reader comparing the YAML-shape rule against the registry finds no rule for
  the field-level shape.
- **The callable set is the only door.** 0001 §"The callable set is the only
  door" records that the prompt-mode query-time loop installs exactly the
  callable set as the model's active tools for the query window with no union of
  the ambient snapshot, and `tool-calls.md:3` states that the same callable set
  backs the model-driven and code-driven paths. A set emptied at load is not
  recoverable at query time by either path, so the load-time diagnostic is the
  only place the author can learn about it.
- **The diagnostic the author gets names the field they got wrong.** The
  measured code-side outcome is `theta/parse/unknown-identifier` at the call
  site of a tool the author declared. That code's subject is an undeclared
  name; here the name is declared and the declaration was discarded.

## Actual behaviour / root cause

**The extractor enumerates two node kinds and returns the absent value for the
rest.**

```ts
function extractToolsList(node: unknown, yamlSource: string): readonly string[] | undefined {
  if (isScalar(node)) { … }
  if (isSeq(node)) { … }
  return undefined;
}
```

`src/parser/frontmatter.ts:418–439`. `:438` is the arm a flow mapping, a block
mapping, and any other node kind take. The 0069 fix made the contract explicit
in the doc comment rather than leaving it implicit in the control flow
(`:406–410`):

> an absent `tools:` field, and a `tools:` value that is neither a scalar nor a
> sequence (a YAML mapping, flow or block, or any other unenumerated node kind),
> both yield `undefined` (no callable set) — the per-item recovery above closes
> the sequence ITEM, not the whole-field shape.

**The field's presence is not recorded, so nothing downstream can distinguish
the two states.** The `tools` arm of the key walk is two statements
(`:915–921`): call the extractor, `continue`. The only local is
`toolsValue` (`:832`), and the returned frontmatter spreads `tools` only when it
is defined (`:1240`). `ParsedFrontmatter.tools`'s own doc comment says "Present
iff the theta declares a non-empty `tools:` field" (`:148–154`); for a mapping
value the field IS declared and the property is absent. The `params` arm two
blocks up does record presence and range (`:902–907`), which is what lets
`:1095–1109` raise `theta/load/params-null` against a present-but-unusable
`params:`.

**The consumer's early return is the absent-field branch.**

```ts
  const toolsList = parsed.frontmatter.tools;
  if (
    toolsList === undefined ||
    toolsList.length === 0 ||
    parsed.sourcePath === undefined
  ) {
    // No `tools:` → the empty callable set …
    return { diagnostics: [], callableSet: EMPTY_CALLABLE_SET };
  }
```

`src/extension/production-composition.ts:1401–1410`. `EMPTY_CALLABLE_SET`
(`:1378–1380`) is the frozen empty map, the same value an absent field and
`tools: []` produce. `resolveCallableSet` — the sole owner of every `tools:`
rejection, including 0069's new code — is called at `:1479–1483` and is
unreachable from this branch. That is why the measurement shows no
`theta/load/malformed-tool-entry` for any field-level mapping row: the check
exists and the input never arrives at it.

**The resolver's input type cannot express the state either.** `ToolsField`
(`src/parser/callable-set.ts:45–48`) has three arms — `absent`, `scalar`,
`list` — and production always passes `list` (`:1481`), because the frontmatter
layer has already collapsed both spellings into a string array. Measured: all
three arms return zero diagnostics and zero entries on an empty input. There is
no arm for "the field is present and its shape is not a spelling", so a
diagnostic sited in `resolveCallableSet` alone cannot cover this input — the
same reachability argument 0069 §Fix constraint 3 recorded for the sequence
item, which 0069 answered by recovering the item's verbatim source at the
frontmatter layer (`:434`) so the shared grammar could judge it.

**Four readers of `frontmatter.tools` narrow together.** `collectIdentRoots`
(`src/parser/theta-document.ts:4557`) and `checkLexicalCallSites` (`:5203`) both
iterate `frontmatter.tools ?? []`, so neither seeds the identifier root scope
nor the `piTools` / `callables` sets — which is why a body reference to a
declared tool draws `theta/parse/unknown-identifier` rather than resolving.
`resolveSubagentSessionConfig` (`:958`) tests `!== undefined`, so a
`subagent fn` inherits the empty set. `presentedCallableNames`
(`src/extension/production-theta-producer.ts:3600–3620`) answers from the frozen
snapshot in production (`:3602–3604`, and the snapshot is `EMPTY_CALLABLE_SET`)
and from `frontmatter.tools ?? []` on the harness path (`:3606`). Every reader
behaves correctly on the value it is given; none can see that a value was
discarded.

**The failure is attributed to the wrong subsystem in both directions.** With no
code-side reference the theta registers and runs, and the only observable is
that the model was never offered the tool — an outcome an author attributes to
the model. With a code-side reference the theta does not register and the
diagnostic names the body: `theta/parse/unknown-identifier: unknown identifier
'read'` at the call site, plus the cascading
`theta/parse/bare-object-literal` on the argument (measured), because the callee
is absent from `checkLexicalCallSites`' `piTools` set (`:5203`) so
`resolvesToPiTool` is false (`:5363–5366`) and bug 0016 part B's bare-object
rejection (`:5383–5391`) takes the argument the Pi-tool carve-out would have
admitted. Neither surface mentions `tools:`.

## Why it matters

- **The declared callable set silently empties.** 0001 established that the
  callable set is the sole door for both model-facing and code-side reach, and
  `tool-calls.md:3` states that one declaration backs both paths. An input the
  spec's two spellings exclude replaces the author's whole declaration with the
  empty set, at load, with no signal.
- **The author's text names the tool.** `tools:` over `  read: bash` and
  `tools:` over `  read:` both contain `read` and both deliver a theta that
  cannot call it (measured). A block mapping is what a `tools:` field acquires
  from a copy-paste of a `params:` or `tool_loop:` block, or from writing an
  entry's rename as a YAML key (`read: file_read`) instead of `read as file_read`.
- **The diagnostic, when there is one, points at the body.** The measured
  code-side pair is two files differing only in the field's YAML node kind:
  `tools: read` registers and binds; `tools:` over `  read: bash` un-registers
  with `theta/parse/unknown-identifier: unknown identifier 'read'` at the call
  site (`:6:9`). Whoever reads that is directed at the body rather than at the
  frontmatter, and so is anyone triaging the report.
- **The silent half has no diagnostic at all.** The `` @`hi` `` rows register
  with zero diagnostics at any severity, in both spellings, in both modes. The
  observable is a worse model answer with no trace at load.
- **The registry documents a narrower refusal than the YAML-shape rule
  states.** `code-registry-load.md:25`'s *Trigger* covers the entry and the
  sequence item. `frontmatter-fields-b-and-templates.md:3` states the field
  admits two spellings, and `:18` states that every `tools:` rejection
  un-registers the theta. Leaving both is the state 0069 closed one level down.
- **0069 named it the last one.** Its fix report's disposition for this
  residual is "**Worth filing** — it is the last silent-narrowing path on the
  `tools:` surface" (`.pi/tmp/fixes/0069-report.md:305–306`). Every other
  `tools:`-shaped mistake now produces an error-severity load diagnostic; this
  one produces the empty set.
- **Nothing in the corpus scores it.** Zero of the 34 committed `.theta` /
  `.thetalib` files carry a mapping-valued `tools:` field, and no cell in
  0069's witness (`tests/tools-entry-closed-grammar.test.ts`) or in
  `tests/production-tools-load-resolution.test.ts` pins the shape in either
  direction. The behaviour is reachable only by an author writing the shape for
  the first time.

## Non-goals

- **The entry grammar.** `parseToolsEntry`
  (`src/parser/callable-set.ts:292–316`) and its two admitted token shapes are
  0069's and stay unchanged. This report is about which values reach it.
- **The two null spellings.** A bare `tools:` key and `tools: null` both parse
  as a null scalar, take the `isScalar` arm, and produce the single entry `null`
  → `theta/load/unknown-tool: unknown Pi tool 'null'`, un-registering the theta
  (measured). That is loud and error-severity. Whether the message should name
  the shape rather than a Pi tool called `null` — the `params:` surface has a
  dedicated `theta/load/params-null` for the same spelling
  (`code-registry-load.md:18`) — is a separate adjudication, and a DIAG-4
  *Message* reword either way.
- **The non-map `params:` value.** `params: read` and `params: [a]` register
  with no diagnostic (measured): `extractParsedParams`
  (`src/parser/frontmatter.ts:699–701`) returns the absent result for any
  non-map node, exactly as `extractToolsList` does for any non-scalar,
  non-sequence node. `theta/load/params-null` covers only the null spelling and
  `theta/load/params-type-not-expression` is per-FIELD RHS
  (`code-registry-load.md:19`), so the whole-field shape is uncovered there too.
  Same shape, different field, unfiled; refusing the `tools:` value neither
  fixes nor depends on it.
- **`tools: []` and the absent field.** Both stay silent and both keep
  registering with the empty callable set. `frontmatter-fields-a.md:74` states
  the equivalence and it is not disturbed.
- **The `theta/parse/bare-object-literal` cascade.** The code-side rows emit it
  alongside the identifier error because the callee is absent from
  `checkLexicalCallSites`' `piTools` set (`src/parser/theta-document.ts:5203`),
  which makes `resolvesToPiTool` false (`:5363–5366`): the bug-0003 tool-argument
  shape rule stands down (`:5371–5377`) and bug 0016 part B's bare-object
  rejection takes the sole object argument instead (`:5383–5391`). It is correct
  for an unresolved callee and it disappears once the field is refused at load;
  re-shaping it is not part of closing this gap.
- **0070's derived default name.** `thetaDefaultName` and `thetaCallableName`
  are untouched. 0070's inputs are well-formed entries; this report's input
  produces no entry.

## Fix

**Refuse a `tools:` field whose value is neither a scalar nor a sequence, at
error severity, so the theta does not register.** The route is not settled: the
registry disposition (constraint (a)) is adjudicated in the run.

*Route frame.* The value never reaches `resolveCallableSet`
(`src/extension/production-composition.ts:1401–1410` returns first), so the
refusal is sited where the YAML node is still in hand — `extractToolsList`'s
caller in `src/parser/frontmatter.ts:915–921`, or `extractToolsList` widened to
report. That layer already carries error-severity, ranged, registration-blocking
load diagnostics: `theta/load/params-null` (`:1095–1109`) and
`theta/load/params-type-not-expression` (`:724–731`), the latter being the
closest precedent — a YAML-shape refusal judged "where the field's YAML is still
in hand" (`code-registry-load.md:19`). The `params` arm's presence tracking
(`:902–907`) is the pattern the `tools` arm lacks. 0069's own answer to the same
reachability problem one level down was to recover the offending node's verbatim
YAML source at this layer (`paramValueSource`, `:434`) and feed it to the shared
grammar; whether that frame transfers at field level is constraint (c).

Constraints on any implementation:

(a) **The registry disposition is adjudicated in the run, and DIAG-4 decides
   it.** Two dispositions are available.

   *Widen `theta/load/malformed-tool-entry`'s Trigger.* This is the registry
   economy 0069 chose when it folded the non-scalar sequence item into the entry
   grammar rather than minting a second code: one rule, one code, and the
   *Trigger* at `code-registry-load.md:25` already carries a sentence for the
   non-scalar sequence item. The blocker is that code's *Message*:
   `malformed 'tools:' entry '<value>'; expected a Pi tool name or a .theta path,
   optionally followed by an 'as' clause` (`src/parser/callable-set.ts:194`,
   `code-registry-load.md:25`, `docs/reference/diagnostics.md:188`). A
   field-level mapping is not an *entry* and the expectation it states is the
   entry grammar, not the field's YAML shape, so a widened *Trigger* renders a
   message that misdescribes its own input — and DIAG-4
   (`diagnostic-shape.md:74`) defers a *Message* reword to theta 2.0. A widened
   *Trigger* is admissible only if a `<value>` rendering exists under which the
   existing message is true of both input sets.

   *Add one code.* A distinct row states the field's YAML shape rather than an
   entry's token shape, mirroring how the `params:` surface carries
   `theta/load/params-null` and `theta/load/params-type-not-expression` as
   separate rows from its per-entry rules. It costs a registry row and buys a
   message that names the defect.

   Either disposition is a DIAG-2 registry edit
   (`diagnostic-shape.md:72`) landed with the `docs/reference/diagnostics.md`
   mirror in the same commit — 0069 landed both plus the
   `placeholder-rendering-b.md:74` `<value>` enumeration entry, which a new code
   also needs if it interpolates the offending text.

(b) **Error severity, and the theta does not register.** This matches the
   all-or-nothing posture of `theta/load/unknown-tool`
   (`code-registry-load.md:26`, "it un-registers the whole theta") and of
   0069's own code (`:25`, "As with `theta/load/unknown-tool` below, one
   malformed entry un-registers the whole theta"), and it is what
   `frontmatter-fields-b-and-templates.md:18` states for the whole `tools:`
   rejection family. 0069 records the same posture as bug 0042's for
   `theta/parse/malformed-alias-rhs` — rejected outright rather than truncated,
   under a new registered code landed in the same commit as its spec sentence;
   the transferable half here is the outright rejection and the same-commit spec
   sentence, since this input carries no complete-construct-plus-residue shape.
   Registration is computed from the diagnostic
   severities already (`production-composition.ts:1488`), and the frontmatter
   layer's diagnostics reach it — measured: `params: null` un-registers.

   The diagnostic carries a range. 0069's entry-level code does not
   (`src/parser/callable-set.ts:189–195`, reported file-level — measured), because
   the resolver holds no YAML positions. The frontmatter layer does: the key walk
   has `keyRange` and `valueRange` in scope at the `tools` arm
   (`src/parser/frontmatter.ts:915–921`, used two blocks up by `params` at
   `:905`), and `theta/load/params-null` reports at `3:9` on the value
   (measured). A field-level refusal sited there is ranged; a widened *Trigger*
   on the entry-level code would report two granularities under one row, which is
   an argument for the second disposition in (a).

(c) **The emission point must be reachable.** The field never reaches
   `resolveCallableSet`, and `ToolsField`
   (`src/parser/callable-set.ts:45–48`) has no arm that could carry it: all
   three arms produce zero diagnostics on an empty input (measured). A
   diagnostic sited only in `src/parser/callable-set.ts` cannot cover this
   input. Two frames are available and the choice is part of the route: emit at
   the frontmatter layer where the node is in hand (the
   `theta/load/params-type-not-expression` frame), or recover the field's
   verbatim YAML source and route it through the resolver (0069's
   `paramValueSource` frame). Under the second, a BLOCK mapping
   spans multiple lines, so its recovered slice embeds a raw newline in a
   `message` that `diagnostic-shape.md:34` describes as a single-line summary —
   0069 §Fix *Residuals* item 2's hazard, reached head-on at field level rather
   than only by a multi-key sequence item.

(d) **The genuinely-absent field keeps registering silently with the empty
   callable set.** `frontmatter-fields-a.md:74` states that "`tools: []` and an
   absent `tools:` field are equivalent" and `:43` pins the empty callable set
   as the absent-field behaviour. Both must stay silent, which requires the
   refusal to distinguish present-with-a-bad-shape from absent — a distinction
   the `tools` arm does not record today (`src/parser/frontmatter.ts:915–921`,
   `:832`, `:1240`), and which the `params` arm records with `paramsPresent`
   (`:902–907`). The empty flow mapping `tools: {}` is a mapping, not `[]`, and
   the route must state which side of the line it falls on.

(e) **The refused set is enumerated, and the spec sentence lands with it.**
   Measured in §Reproduction and refused by this fix: a flow mapping
   (`tools: {a: b}`, `tools: {read: bash}`, `tools: {read: 1, grep: 2}`), a
   block mapping (`tools:` over `  a: b`, `  read: bash`, `  read:`), a nested
   block mapping, and — per (d) — a decision on `tools: {}`. Every shape the two
   spellings admit stays silent: a plain scalar, a comma short form, a sequence,
   `tools: []`, an absent field, and 0069's non-scalar sequence item (which
   keeps its existing code and range-less file-level report). The two null
   spellings keep `theta/load/unknown-tool` (§Non-goals). Neither
   `frontmatter-fields-a.md:88` nor `frontmatter-fields-b-and-templates.md:3`
   states a field-level shape rule today, so the fix adds one — 0069 landed its
   enforcement in the same commit as its `:88` sentence and mirrored it into
   `docs/reference/frontmatter.md:134–137`, and the field-level rule needs the
   same treatment at `frontmatter-fields-b-and-templates.md:3` /
   `docs/reference/frontmatter.md:179–181` (the YAML-shape statements) plus the
   `:18` rejection-family enumeration and the field-contract rows
   (`frontmatter-fields-a.md:43`, `docs/reference/frontmatter.md:51`), whose
   "Behaviour when absent" cells are what a mapping value currently collapses
   onto.

(f) **GOV-15: the refused set loads cleanly today and the census is re-run.**
   Every refused shape emits no diagnostic of effective severity `E`
   (measured: `diags []`), so all of them sit inside GOV-15's loads-cleanly
   input set (`source-language-stability.md:9`) and the addition is covered by
   the diagnostic-registry carve-out (`:25`) — as a code addition for inputs
   that did not previously emit the added code, or as a *Trigger* change
   dispositioned "as an addition for inputs newly brought into the code's
   emission set". Two variants are already outside that set and stay outside it:
   the field-level mapping paired with a code-side reference already emits
   `theta/parse/unknown-identifier` (measured), and the two null spellings
   already emit `theta/load/unknown-tool`. Measured occurrences in the tree:
   **zero** — 34 committed `.theta` / `.thetalib` files, fourteen with a
   frontmatter `tools:` field (two scalar, twelve sequence), zero mapping-valued;
   zero mapping-valued `tools:` in any TypeScript-literal fixture under
   `tests/`. The census is re-run at the fix baseline as a measured claim and
   must reach TypeScript string literals as well as committed corpus files.

(g) **The four `frontmatter.tools` readers keep their `?? []` guards.** Refusing
   the field does not change what they receive: `collectIdentRoots`
   (`src/parser/theta-document.ts:4557`), `checkLexicalCallSites` (`:5203`),
   `resolveSubagentSessionConfig` (`:958`) and `presentedCallableNames`
   (`src/extension/production-theta-producer.ts:3606`) all still see
   `undefined` for a refused field, because the parse continues past a load
   diagnostic. No invariant is asserted at any of them: the refusal is the
   observable, the readers' input class is unchanged, and an assert would crash
   on refused input.

(h) **Test witness — unit, offline, provider-free.** Every row in
   §Reproduction settles inside one `discoverAndComposeFixtures` over a planted
   `.pi/theta/` workspace, one `parseFrontmatter`, or one `resolveCallableSet`.
   Required: each shape in (e) refused, with the range asserted per (b); the
   registered-and-silent pair for each of the two mapping spellings proven to
   red (the shape this fix removes); the two scalar / sequence controls and the
   absent-field and `tools: []` controls proven still silent; the code-side pair
   that today yields `theta/parse/unknown-identifier` pinned as the reason it is
   now unreachable, so a later narrowing of the refusal reds; 0069's non-scalar
   sequence item keeping its own code and not acquiring the new one; and the two
   null spellings keeping `theta/load/unknown-tool`. The natural home is a new
   group beside `tests/tools-entry-closed-grammar.test.ts` groups (A)–(C), which
   already carry the registry-row assertion and the production-load matrix this
   witness needs.

## Provenance

- Origin: the bug 0069 fix (0.62.0), §Fix *Residuals* item 1
  (`docs/bugs/0069-tools-entry-residue-silently-dropped.md:167–177`) and the fix
  report it was distilled from (`.pi/tmp/fixes/0069-report.md:294–306`, whose
  disposition line is "**Worth filing** — it is the last silent-narrowing path
  on the `tools:` surface"), from
  reviewer finding R1: "A whole-field non-scalar `tools:` value still loads
  silently. `extractToolsList`'s final `return undefined`
  (`src/parser/frontmatter.ts`) covers a `tools:` VALUE that is neither a scalar
  nor a sequence — a flow or block mapping — so `tools: {a: b}` is treated as an
  absent field and the theta registers with the empty callable set, no
  diagnostic. Same hazard class one level up; out of scope here because §Fix
  constraint 3 names the *sequence item* and §Reproduction's input table
  contains only `- {a: b}`." That residual is a code-reading finding; this
  report adds the measurements — the registered-and-silent rows in both
  spellings and both modes, the code-side rows and the diagnostic they actually
  produce, the block-mapping spellings whose keys name real tools, the `.theta`
  callable row, the direct frontmatter-layer extraction table, the resolver's
  three-arm behaviour on an empty input, the null-spelling contrast, the
  `params:` precedent rows, the four-reader inventory, the corpus census, and
  the two registry dispositions with the DIAG-4 constraint that decides between
  them.
- Spec: `docs/spec_topics/frontmatter/frontmatter-fields-a.md:12` (the header
  example), `:28–32` (§Field contract and the unknown-key policy), `:36`, `:39`,
  `:41` (the three rows stating the missing-vs-present-but-bad split), `:43`
  (the `tools` field-contract row), `:72` (the shared model/tools shape), `:74`
  (§`tools`), `:76` (the two entry kinds), `:78–79` (the kinds), `:81–86` (the
  naming rules and the `as` clause), `:88` (0069's closed-grammar sentence),
  `:90`, `:92` (FRNT-2, FRNT-3);
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:3`
  (§YAML-shape and the two spellings), `:5–16` (the two examples), `:18` (the
  rejection-family enumeration 0069 extended), `:22–29` (§Resolution snapshot);
  `docs/spec_topics/diagnostics/code-registry-load.md:15`
  (`unknown-frontmatter-field`, `W`), `:18` (`params-null`), `:19`
  (`params-type-not-expression`), `:25` (`malformed-tool-entry` and its
  entry-granularity *Trigger*), `:26` (`unknown-tool` and the all-or-nothing
  sentence), `:27–30` (the remaining per-entry `tools:` rejections), `:38`
  (`callee-has-errors`);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:34` (`message` is a
  single-line summary), `:72` (DIAG-2), `:74` (DIAG-4);
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md:74` (the parse-time
  literal-value `<value>` sub-rule, already naming
  `theta/load/malformed-tool-entry`);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
  (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out);
  `docs/spec_topics/glossary.md:15` (*callable set*), `:61` (*Pi tool* vs
  *`.theta` callable*); `docs/spec_topics/tool-calls.md:3` (one callable set
  backs the model-driven and code-driven paths). User-facing:
  `docs/reference/frontmatter.md:37–40` (the unknown-key policy), `:51` (the
  `tools` field-contract row), `:105–192` (§`tools:` (callable set)), `:117–131`
  (the "Two entry kinds" block), `:134–137` (0069's closed-grammar statement),
  `:179–181` (the YAML-shape statement), `:183–192` (the resolution snapshot);
  `docs/reference/diagnostics.md:188` (the `malformed-tool-entry` mirror row).
- Implementation evidence at `99b65438`: `src/parser/frontmatter.ts:155` (the
  `tools` property and its `:148–154` contract), `:258–271` (the theta 1.0 field
  vocabulary), `:360` (`paramValueSource`), `:398–417` (the doc comment 0069's
  fix added, the contract at `:406–410`), `:418–439` (`extractToolsList`: `:419`
  the scalar arm, `:426` the sequence arm, `:434` 0069's per-item recovery,
  `:438` the final `return undefined`), `:699–701` (`extractParsedParams`'
  non-map early return), `:724–731` (the per-field
  `params-type-not-expression` push), `:832` (`toolsValue`), `:902–907` (the
  `params` arm's presence and range tracking), `:915–921` (the `tools` arm),
  `:1095–1109` (the `params-null` refusal), `:1240` (the conditional spread);
  `src/extension/production-composition.ts:190–210` (`makeLoadEmit`, the notify
  and stderr sinks), `:1378–1380` (`EMPTY_CALLABLE_SET`), `:1391–1410`
  (`resolveThetaToolsAtLoad` and its early return), `:1479–1483` (the
  `resolveCallableSet` call), `:1488` (the registration computation),
  `:1583–1586` (`toolsEntrySpec`);
  `src/parser/callable-set.ts:45–48` (`ToolsField`), `:173–197`
  (`resolveCallableSet` and 0069's malformed arm, the message at `:194`),
  `:257–259` (`ToolsEntryParse`), `:278–290` (`splitEntries`), `:292–316`
  (`parseToolsEntry`);
  `src/parser/theta-document.ts:933–960` (`resolveSubagentSessionConfig`, the
  `tools` inheritance test at `:958`), `:4553–4563` (`collectIdentRoots`'
  frontmatter arm, `:4557`), `:5196–5212` (`checkLexicalCallSites`' `piTools` /
  `callables` construction, `:5203`);
  `src/extension/production-theta-producer.ts:3586–3620`
  (`presentedCallableNames`, the snapshot arm at `:3602–3604` and the
  `frontmatter.tools` fallback at `:3606`).
- Test and corpus evidence at `99b65438`:
  `tests/tools-entry-closed-grammar.test.ts` (0069's witness — group (A) the
  registry row, group (B) the production-load matrix whose `mapitem` cell at
  `:252–263` is the non-scalar sequence ITEM, group (C) the resolver-direct
  token boundary; no cell carries a mapping-valued `tools:` field);
  `tests/production-tools-load-resolution.test.ts` (the planted-workspace
  harness pattern this report's probes reuse; scalar and sequence `tools:` values
  only); the corpus census
  `rg --files --glob '*.theta' --glob '*.thetalib' .` (34 files) and
  `rg -n '^\s*tools\s*:' --glob '*.theta' --glob '*.thetalib' .` (fifteen hits
  across fourteen files — `docs/examples/call-tool.theta:4` and
  `docs/examples/configure-tool-loop.theta:4` scalar, twelve sequence, plus the
  body `with` clause at `docs/examples/ralph-inline.theta:22`; zero
  mapping-valued).
- Reproduction: three scratch vitest probes at `99b65438` — a multi-theta
  planted-workspace load for the registered set and the notification set, a
  one-theta-per-row load with the stderr mirror captured for per-row attribution
  (seventeen rows: the field-level mapping shapes in both spellings with and
  without a code-side reference, the block mappings keyed on real tool and
  callee names, the subagent-mode row, the two spelling controls, the
  absent-field and `tools: []` controls, 0069's sequence-item control and the
  bare-`tools:` null row), and a third for the `params:` / unknown-key precedent
  rows and `resolveCallableSet`'s three arms on an empty input. Run on the
  outputs quoted above, then deleted per scratch policy. No file in the tree was
  written by the probes. `src/`, `tests/`, `docs/bugs/README.md` and every other
  bug doc are unmodified by this filing.

## Fix (0.127.0)

- **The adjudication** — §Fix constraint (a) offered two dispositions and this
  run took the second: **one new registered code**,
  `theta/load/malformed-tools-field` (`E`, phase `load`), rather than a widened
  *Trigger* on `theta/load/malformed-tool-entry`. The widening was rejected on
  the grounds constraint (a) itself named as decisive: that code's normative
  *Message* is `malformed 'tools:' entry '<value>'; expected a Pi tool name or a
  .theta path, optionally followed by an 'as' clause`, whose subject is an
  *entry* and whose stated expectation is the closed per-entry grammar. A
  field-level YAML mapping is not an entry and the field's YAML shape is not the
  entry grammar, so no `<value>` rendering exists under which that message is
  true of both input sets, and DIAG-4
  (`docs/spec_topics/diagnostics/diagnostic-shape.md:74`) defers a *Message*
  reword to theta 2.0. Constraint (b) reinforced it independently: the
  entry-level code carries no range (`resolveCallableSet` holds no YAML
  positions) while this refusal must be ranged, so one row would report two
  granularities. The new *Message* is a **fixed string with no placeholder** —
  `malformed 'tools:' field; expected a comma-separated list of entries or a
  YAML sequence` — which discharges two further constraints by construction:
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md` needs no edit and no
  `<value>` sub-rule is reused (the placeholder table is closed and this code
  interpolates nothing), and constraint (c)'s block-mapping hazard — a
  multi-line recovered slice inside a `message` that `diagnostic-shape.md:34`
  describes as a single-line summary — cannot arise. 0069's `paramValueSource`
  recovery frame was therefore not transferred to the field level.
- **What shipped**
  - `src/parser/frontmatter.ts` — the site. The `tools` arm of the frontmatter
    key walk routes to `extractToolsList` only when the value node is a scalar
    or a sequence, and otherwise records the refusal's range as
    `valueRange ?? keyRange` — the pattern the `params` arm two blocks up uses
    for `theta/load/params-null`, and the range convention every other
    frontmatter-shape refusal in the file follows. The diagnostic is pushed
    beside the `params-null` push. `extractToolsList`'s doc comment now states
    its caller precondition (it is reached only for the two admitted spellings)
    and why the field-level refusal lives at the caller: the caller holds the
    YAML node and its range, and downstream the two spellings are already
    collapsed into a plain string array, so a present-but-unusable shape would
    be indistinguishable from an absent field — the §Fix constraint (c)
    reachability argument. Net `+33` lines; no new field on
    `FrontmatterParseResult` or `ParsedFrontmatter`.
  - `docs/spec_topics/diagnostics/code-registry-load.md` — the DIAG-2 registry
    row, immediately after `theta/load/malformed-tool-entry` (its sibling one
    granularity down). Its *Trigger* states the field-level YAML shape rule in
    spec vocabulary with no implementation identifier, enumerates the refused
    set and the unchanged set, states the range and the all-or-nothing
    un-registration, and cross-references the sibling row's granularity (that
    row owns the ENTRY and the sequence ITEM; this row owns the FIELD's value
    shape).
  - `docs/reference/diagnostics.md` — the user-facing mirror row, landed in the
    same change as the registry row per DIAG-2. The *Message* is byte-identical
    across the registry row, the mirror row and the string literal in
    `src/parser/frontmatter.ts` (compared verbatim in review round 2).
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md` — the `tools`
    field-contract row and §`tools` prose now state the refusal, so a value
    outside the two spellings no longer collapses onto the "Behaviour when
    absent" cell. The closed per-entry grammar sentence and the two-entry-kinds
    block are byte-unchanged.
  - `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md` —
    §YAML-shape carries the field-level rule the page previously left unstated,
    and the rejection-family enumeration includes the new code.
  - `docs/reference/frontmatter.md` — the three mirrors: the field-contract row,
    the §`tools:` closed-shape statement, and the YAML-shape paragraph.
  - `tests/tools-field-shape-refusal.test.ts` — **new**, 37 cells, this report's
    witness (§Fix constraint (h)). Group (D1) sources the normative *Message*
    from the code registry via `registryMessage` per DIAG-4, so it reds until the
    registry row lands. (D2) is a 12-row `parseFrontmatter` shape matrix
    asserting, per row, exactly one error-severity `malformed-tools-field`, the
    **exact** `SourceRange`, `registered === false` and a withheld frontmatter.
    (D3)/(D4) are the production-load half over the shipped composition root
    (`discoverAndComposeFixtures`, one theta per planted `.pi/theta/` workspace),
    with a precondition-guard cell so no un-registration assertion can pass
    vacuously. (D5) pins the five silent controls, (D6) pins 0069's non-scalar
    sequence ITEM keeping its own code and not acquiring the new one, and (D7)
    pins the two null spellings keeping `theta/load/unknown-tool`.
  - `tests/live/tools-field-shape-refusal-live-cell.test.ts` — **new**, one
    additive H8a cell carrying the literal token `CELL-C` in its title and
    header (the parent renumbers at merge). Registration-only observable off the
    settled `ExtensionRunner` (`handle.command` / `handle.registeredNames`)
    after the real `session_start` → `pi.registerCommand` step, never a
    `prompt()` resolution: a `tools: {read: bash}` theta must be absent from the
    registered set while a sibling naming the SAME entry in the plain-scalar
    spelling registers, with the control asserted first as a loud precondition.
    Zero model turns; no RFC-0006 subagent child launch is reached (both planted
    thetas are `mode: prompt` and no command is invoked).
- **The refused set, as shipped** (§Fix constraint (e), each measured through
  `parseFrontmatter` with its exact range): a flow mapping (`tools: {a: b}`,
  `{read: bash}`, `{read: 1, grep: 2}`), the **empty** flow mapping `tools: {}`,
  a block mapping (over `a: b`, `read: bash`, and the null-member `read:`), a
  nested block mapping, a YAML **alias** value, and a `tools:` key carrying no
  value node at all. Unchanged and still silent: a plain scalar and the comma
  short form, a sequence, `tools: []`, and an absent field. 0069's non-scalar
  sequence ITEM keeps `theta/load/malformed-tool-entry` with its verbatim entry
  text and its range-less file-level report; the two null spellings keep
  `theta/load/unknown-tool: unknown Pi tool 'null'`.
- **§Fix constraint (d), decided** — `tools: {}` is **REFUSED**. The predicate is
  the value node's KIND, not its emptiness: the spec equivalence is `tools: []`
  (a sequence) ≡ an absent field, and it does not extend to a mapping. The
  genuinely-absent field and `tools: []` both keep registering silently with the
  empty callable set, which the refusal distinguishes because it is recorded at
  the key walk where the field's presence is still observable.
- **§Fix constraint (g), honoured** — the four `frontmatter.tools` readers
  (`collectIdentRoots`, `checkLexicalCallSites` and
  `resolveSubagentSessionConfig` in `src/parser/theta-document.ts`,
  `presentedCallableNames` in `src/extension/production-theta-producer.ts`) are
  untouched; they still receive `undefined` for a refused field and assert
  nothing. `src/parser/frontmatter.ts` is the only `src/` file changed.
- **§Fix constraint (f), re-measured at the fix baseline** — GOV-15
  loads-cleanly holds for every refused shape (each returned `diags []` before
  the fix, so all sit inside `source-language-stability.md:9`'s input set and the
  addition is covered by the diagnostic-registry carve-out at `:25`). Census:
  34 committed `.theta` / `.thetalib` files, 15 `tools:` hits across 14 files
  (two scalar, twelve sequence, plus the body `with { tools: … }` flow array
  which is not frontmatter YAML), **zero mapping-valued**; zero pre-existing
  mapping-valued `tools:` YAML in any TypeScript string-literal fixture under
  `tests/`. The corpus-wide claim is discharged by
  `tests/committed-fixture-parse-gate.test.ts` inside the default suite, not by a
  scratch probe.
- **Gates** (each run by the orchestrator, not taken on report):
  `npx vitest run tests/tools-field-shape-refusal.test.ts` → 37/37 passed (the
  same file ran 19 failed / 18 passed against the pre-fix tree, and 18 failed /
  19 passed against the neutralised fix — (D1) staying green in the second case
  because it reads only the registry page). `npm test` → **326 files / 5984 tests
  passed**, zero red (fork baseline 325 / 5947; the delta is this witness's 37
  cells). `npx tsc --noEmit` → clean. `npm run lint` → clean.
  `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) → clean. Live, under the
  live-lock: the H8a `CELL-C` cell green, red under neutralisation with the
  expected signature, green again after restore; the full H8a suite 69/69 across
  six files (68 pre-existing — 60 of them in
  `tests/live/live-production-acceptance.test.ts`, which is the "60 cells"
  baseline — plus `CELL-C`); H9a **11/11** across both files after one permitted
  isolated re-run of two `0xC0000142` child-spawn reds, a documented stochastic
  class.
- **Review** — 2 rounds. Round 1 (deep): 2 defects. **F1** `fidelity` — the
  implementation carried a ~30-line helper that RE-PARSED the frontmatter YAML
  with a trailing newline appended, solely so a block collection in last
  frontmatter position got a range end rolling to the next line's column 1; it
  was a `tools:`-only exception to the range convention every other frontmatter
  refusal follows off the shared newline-stripped parse (the same extraction
  artifact affects `theta/load/params-type-not-expression` identically and is
  pinned there by `tests/schema-field-name-case.test.ts`), its three fallback
  branches were provably unreachable, and it existed to satisfy expected ranges
  the witness had derived from an oracle that appended a newline the shipped
  `extractFrontmatterBlock` never produces. Remedy: the helper deleted, the arm
  reduced to `valueRange ?? keyRange`, and four witness END positions corrected
  to the shipped parser's measured values with starts unchanged and exact
  `toEqual` retained. **F2** `spec` — the landed prose claimed "Only an absent
  `tools:` field and `tools: []` yield the empty callable set" / "the two
  equivalent silent forms", which is false: `tools: ""` and `tools: " , "` are
  plain scalars (an admitted spelling, correctly not refused) that also yield the
  empty callable set silently. Remedy: the exclusivity and the definite-article
  cardinality dropped at six sites, mirroring `docs/reference/frontmatter.md`'s
  field-contract row, which already read non-exclusively. Two `prose` residuals
  were fixed in the same round: a sentence reorder so §YAML-shape's colon
  lead-in flows into the admitted-spelling examples again, and a gloss on the
  compact table rows distinguishing "no value node" (only `? tools` and a
  flow-mapping `{tools}`) from a bare `tools:`, which parses as a null scalar and
  keeps `theta/load/unknown-tool`. Round 2 (fast): **CLEAN**, with the *Message*
  byte-equality across all three sites and the `frontmatter-fields-a.md`
  entry-grammar sentences re-verified as untouched.
- **Verification** — **SOLID**, no findings. The witness genuinely witnesses:
  neutralising the source fix alone reddened 18 of 37 cells with the right
  symptom (the refused shapes register with zero diagnostics, byte-identical to
  the absent field), and the restore was proven byte-exact by blob hash
  (`cbd72eb78e00ca66bcef43fb91594ae70d595c95` before and after both
  neutralise/restore cycles). The default suite is green at 326 / 5984. The H8a
  `CELL-C` cell was red-proven in both directions. H9a ran for real on both
  files. Lint and typecheck are clean. The GOV-15 census was re-measured
  independently. **Permitted-codes decision, made by the real H9a run:**
  `theta/load/malformed-tools-field` is **NOT** appended to
  `tests/fixtures/h7a/permitted-codes.json` — the only acceptance fixture
  carrying a `tools:` field spells it as a sequence, the real H9a run emitted no
  occurrence of the code in either direction, and the code is reachable only by a
  mapping-valued field no committed acceptance fixture plants, so it is
  fault-injection-only with respect to H9a.
- **Residuals**
  1. **The §Non-goals claim about the `theta/parse/bare-object-literal` cascade
     is wrong at HEAD.** §Non-goals states the cascade "disappears once the field
     is refused at load". Measured: an error-severity *frontmatter* refusal
     withholds the frontmatter but does not stop the body checks —
     `mode: prompt` + `tools: read` + `params: null` + a `read({path:"x"})` body
     yields `theta/load/params-null` AND
     `theta/parse/unknown-identifier: unknown identifier 'read'` AND the
     bare-object cascade. So post-fix the code-side rows carry the field refusal
     *in addition to* the body diagnostics, not instead of them. The witness's
     code-side cells therefore pin the refusal's PRESENCE and the
     non-registration rather than the absence of `theta/parse/unknown-identifier`
     — an "absence" assertion could never go green. No behaviour is wrong; the
     doc sentence is.
  2. **The empty and comma-only scalar spellings still yield the empty callable
     set silently.** Measured: `tools: ""` and `tools: " , "` →
     `registered=true, tools=undefined, diags=[]`. Both are plain scalars — an
     admitted spelling — and the scalar arm splits on commas, trims, filters
     empties and returns `undefined` for zero entries. This fix deliberately
     leaves the behaviour alone (it is out of §Fix's stated scope, which is the
     node KIND) and only stops the prose claiming otherwise (F2). Whether an
     author-written `tools:` that declares no entry at all should be distinguished
     from `tools: []` is the same missing-vs-present-but-bad question one level
     further in, unfiled.
  3. **`src/parser/frontmatter.ts` line citations in existing test comments
     drifted, and were mostly already stale before this change.** The fix inserts
     a net `+33` lines after the file's line ~405. Measured against HEAD
     *before* this change: of the 17 distinct `frontmatter.ts:<line>` citations in
     `tests/*.ts`, only `:380–382` (`paramValueCanCarryType`) lands on the symbol
     it names — and it sits above the insertion point, so it is unaffected. The
     handful that were accurate and sit below it (`:645` `splitParamValue`,
     `:730` / `:739` in the key walk, `:1217`, `:1271`) now read `+33`. No
     citation refresh was made: this surface's churn convention is symbols-not-lines
     (0149 `+45`, 0059 `+10`, 0185 `+9` all landed on it without a refresh pass),
     several of the affected files are protected whole-list witnesses
     (`tests/params-scalar-nontype-text-refusal.test.ts` among them) whose
     comments this bug has no authority to edit, and bug 0104 pre-authorizes no
     existing-test change. Recorded as the pre-fix baseline plus a bounded
     `+33` shift, for a dedicated citation pass to take.
  4. **The alias node kind is refused, which §Fix's route frame did not name
     explicitly.** `tools: *a` — even when the anchor holds a legitimate sequence
     — is refused, because a YAML alias is a distinct node kind and not one of the
     two spellings. It is inside §Fix's headline ("neither a scalar nor a
     sequence") and inside constraint (e)'s "any other unenumerated node kind",
     it is stated in every landed spec sentence and in the registry *Trigger*'s
     refused enumeration, it is witnessed, and it is inside GOV-15's carve-out
     (it loaded cleanly at HEAD; zero corpus occurrences). Recorded because a
     reader of §Fix alone would expect only mappings.
- **Discharge notes appended:** none. No sibling bug doc's claim was discharged
  or falsified by this fix.
- **Pinned dispositions / non-goals:** §Non-goals holds as written apart from
  residual 1. The entry grammar (`parseToolsEntry`) is untouched; the two null
  spellings keep `theta/load/unknown-tool`; the non-map `params:` value stays
  uncovered (same shape, different field, unfiled); `tools: []` and the absent
  field stay silent and equivalent; 0070's derived default name is untouched.
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md` is deliberately
  untouched and the new code deliberately does NOT join its `<value>`
  enumeration, because the *Message* interpolates nothing.

## Coordination note — bug 0206 (X.Y.Z), append-only

Bug [0206](./0206-zero-entry-tools-scalar-loads-empty-callable-set.md) discharged
this report's **residual 2** and moved this report's registry row's *Trigger*
boundary. Two facts a reader of the `## Fix (0.127.0)` record above now needs:

- `theta/load/malformed-tools-field` no longer refuses node KINDS only. Its
  *Trigger* in `docs/spec_topics/diagnostics/code-registry-load.md` was widened
  (DIAG-2, same commit as the enforcement) to also refuse a `tools:` **scalar**
  whose comma split yields no entry — the quoted short form (`tools: ""`,
  `tools: " , "`), a block scalar over commas or blank content, and a plain
  scalar an explicit tag carries to the empty string (`tools: !!str`). The
  *Message* is byte-unchanged and DIAG-4 was not engaged; no new row was minted.
- Every outcome this report's §Fix constraints pinned is unchanged. `tools: []`,
  an absent field, `tools: read`, the comma short form, a sequence, 0069's
  non-scalar sequence ITEM, and the two null spellings (a bare `tools:` key and
  `tools: null`, which yield the one entry `"null"` and keep
  `theta/load/unknown-tool`) all keep their outcomes byte-identically. This
  report's witness `tests/tools-field-shape-refusal.test.ts` (37 cells) and its
  live cell are byte-unchanged and green; bug 0206's own witness is a separate
  file.
