# Bug 0108 — A `tools:` Pi-tool entry naming a host tool whose registry name is uppercase-first — `tools: WebSearch` — registers with zero diagnostics and binds the callable `WebSearch`, while `tools: WebSearch as WebSearch`, the identical final name, is refused `theta/load/invalid-tool-rename`: the lowercase-first rule bug 0070 applied to the merged name is scoped to the `.theta` arm, so the one name source that can carry a non-conforming name is the one source with no shape test, and the minted name lands in the PascalCase reference namespace where the collision rule cannot see it (`schema WebSearch` and the callable `WebSearch` coexist parse-clean)

- **Status:** open. §Fix is constraint-pinned, not settled: the diagnostic
  disposition is left to the run — a new registered code for the host-name case,
  or a *Trigger* generalisation of `theta/load/invalid-derived-tool-name` — and
  so is the choice between refusing the `as`-less entry and auto-deriving a
  conforming presented name. No ordering dependency:
  [0070](./0070-theta-callable-default-name-unvalidated.md) shipped in 0.63.0 and
  its shipped arm is what this report measures against. Whoever closes this
  re-pins cells (C6) and (C6a) of
  `tests/tools-derived-name-shape.test.ts:656–691`, which currently pin the
  exemption as deliberate; §Fix constraint 4 pre-authorises that edit.
- **Sev/Diff estimate:** S2/D3 — the same final name is admitted through one
  name source and refused through the other with no diagnostic, and the minted
  name enters the namespace the case regime reserves for schema / enum names; not
  S1 because no value is corrupted and the code-side call is separately refused
  today (`theta/load/extension-tool-unreachable`, measured name-shape-independent),
  so the code-side consequence is latent. D3 because the route is an in-run
  registry adjudication spanning the resolver, the diagnostics registry and its
  spec mirrors, and it must re-pin a sibling witness cell.
- **Kind:** defect — one rule, two name sources, one of them unchecked. Bug 0070
  moved the lowercase-first predicate onto the merged name
  (`src/parser/callable-set.ts`, `resolveCallableSet`: `const name =
  parsed.rename ?? resolution.defaultName;` at `:222`, the check at `:242–254`)
  and then scoped it with `resolution.callable.kind === "theta"` (`:244`). The
  Pi-tool arm's default name is `resolveEntry`'s `defaultName: spec` — the host
  registry name verbatim, no derivation and no shape test (`:379`). Because
  `isBareIdentifier` admits `/^[A-Za-z_][A-Za-z0-9_]*$/` (`:433`) while
  `isLowercaseFirstIdentifier` admits `/^[a-z_][A-Za-z0-9_]*$/` (`:443`), the
  admitted-but-non-conforming class is exactly `[A-Z][A-Za-z0-9_]*`: an
  uppercase-first bare identifier routes to the Pi-tool arm and is bound
  verbatim. Every other non-conforming registry-name shape is already refused —
  a hyphen, a dot or a leading digit fails `isBareIdentifier` and routes to the
  `.theta`-path arm (`theta/load/unresolvable-theta-path`), and an internal space
  fails the entry grammar (`theta/load/malformed-tool-entry`). All four
  dispositions measured in §Reproduction.
- **Related:**
  - [0070](./0070-theta-callable-default-name-unvalidated.md) — **fixed
    (0.63.0)**, the parent; this report is its §Fix *Residuals* item 3. That
    residual and its §Non-goals bullet (`:181–185`) are the deliberate
    disposition this filing reopens, not a regression. §Non-goals sketched the
    gap in principle — "Pi-tool entries: their default name is the registry name
    verbatim, so the same gap exists in principle (a host tool registered under a
    non-identifier name), but no such name is reachable through this repo's
    registry snapshot, and `isBareIdentifier` … already routes a non-identifier
    `tools:` spec to the `.theta`-path arm" — and the fix then made the exemption
    explicit and tested. Its review round 1 ruled the new arm firing on
    `tools: WebSearch` a defect, because the new row's *Trigger* ("a `tools:`
    `.theta` entry's derived default name — the basename without `.theta`, with
    hyphens rewritten to underscores"), its *Hint* ("Rename the callee file to a
    lowercase-first stem, or name the entry with `as <name>`") and its `<path>`
    binding are all false for a Pi tool, which has no file to rename and no
    basename derivation. Residual 3 records the outcome: "`tools: WebSearch`
    resolves and binds `WebSearch` with no diagnostic — the in-principle gap
    §Non-goals sketched, now pinned as deliberate by cell (C6a)." Two of that
    residual's words are corrected here: the minted name is not *unspellable*
    (§Actual behaviour), and reachability is bounded but not hypothetical
    (§Reproduction).
  - [0069](./0069-tools-entry-residue-silently-dropped.md) — **fixed (0.62.0)**,
    which closed the per-entry grammar and exported `parseToolsEntry`. Its
    rejection-family surfaces — the registry rows at
    `code-registry-load.md:25–31`, the §`tools` enumeration at
    `frontmatter-fields-b-and-templates.md:18`, and the user-facing mirror at
    `docs/reference/frontmatter.md:139` — are the ones 0069 and 0070 each
    extended, and where a new code for this case belongs (§Fix constraint 1).
  - [0016](./0016-shadowed-tool-name-runtime-dispatch.md) — **fixed (0.22.0)**,
    which established that the callable set's presented names are the
    environment's arm-4 resolution names. `presentedCallableNames`
    (`src/extension/production-theta-producer.ts:3600`) returns the frozen
    snapshot's keys and `buildBoundEnvironment` (`:3637–3674`) installs them as
    `callables`; `LexicalEnvironment.resolve`'s arm 4
    (`src/runtime/lexical-environment.ts:401–404`) is a set-membership test with
    no shape rule. Measured: `resolve("WebSearch")` →
    `{"arm":"callable","callable":true}`.
  - [0106](./0106-tools-entry-grammar-derivations-outside-lockstep.md) — **open**,
    disjoint but adjacent. Its subject is the entry *grammar*'s lock-step across
    four implementations; its last §Affected bullet (`:97–111`) records the
    second axis this report shares — `presentedCallableNames`' snapshot-absent
    fallback applies no name-shape rule, so it derives a presented name the
    resolver would reject. On this report's arm the two currently agree
    (`/^[A-Za-z_][A-Za-z0-9_]*$/.test(parsed.spec) ? parsed.spec : …`,
    `production-theta-producer.ts:3616`, yields `WebSearch` exactly as the
    resolver does); a fix that refuses at the resolver makes them disagree, which
    is §Fix constraint 5.
  - [0104](./0104-tools-field-nonscalar-value-loads-empty-callable-set.md) —
    **open**, disjoint input class: the whole-field non-scalar `tools:` value.
    This report's inputs are all well-formed YAML scalars inside a well-formed
    `tools:` list.
- **Affected** (every citation verified at HEAD `846c110a`, 0.63.0; the
  `callable-set.ts` anchors are given symbol-first because 0070's report records
  that file's lines shifting by roughly +22 over one release):
  - `src/parser/callable-set.ts`, `resolveEntry` (`:359`) — **the site.**
    `:364` routes on `isBareIdentifier(spec)`; `:379` returns
    `{ callable: resolved, defaultName: spec }` under the comment "A Pi-tool
    entry's default name is the Pi tool name verbatim" (`:378`). No predicate is
    applied to `spec` on this arm at any point.
  - `src/parser/callable-set.ts`, `resolveCallableSet` (`:176`) — the merge point
    `:222`, the derived-name arm `:242–254` whose second conjunct is
    `resolution.callable.kind === "theta"` (`:244`), the collision test `:258`,
    and `entries.set(name, resolution.callable)` (`:268`), which is what puts the
    host name into the frozen snapshot. The arm's comment (`:224–241`) states the
    exemption's reason: "the Pi-tool arm's default name is the registry name
    verbatim, so a name outside the rule there is a host-registry fact with no
    file to rename and no derivation to describe (bug 0070 §Non-goals)".
  - `src/parser/callable-set.ts`, `isBareIdentifier` (`:433`) —
    `/^[A-Za-z_][A-Za-z0-9_]*$/`, the arm split. It is what makes the
    uppercase-first class reach the Pi-tool arm and what routes every other
    non-conforming shape away.
  - `src/parser/callable-set.ts`, `isLowercaseFirstIdentifier` (`:443`) —
    `/^[a-z_][A-Za-z0-9_]*$/`. Its doc comment (`:437–442`) already scopes itself
    to "both `tools:` name sources the rule is stated for: the `as` rename
    target, and — absent a rename — a `.theta` entry's derived default name",
    which is the post-0070 enforcement, not the rule §`tools` states.
  - `src/extension/production-composition.ts:1446–1470` — the injected
    `resolvePiTool` dep. `:1447` tries the built-in ladder; `:1460` falls through
    to `resolveRegistryExtensionTool`.
  - `src/extension/production-composition.ts:1670–1692` —
    `builtinToolDefinition`, a closed switch over seven names (`grep`, `read`,
    `find`, `ls`, `bash`, `edit`, `write`), every one lowercase-first. The
    built-in arm cannot produce a non-conforming name.
  - `src/extension/production-composition.ts:1737–1749` —
    `resolveRegistryExtensionTool`. Its whole predicate is
    `(getAllTools?.() ?? []).find((tool) => tool.name === name)` (`:1741`): an
    exact-string match against the `pi.getAllTools()` snapshot with no shape
    constraint. This is the reachability route.
  - `src/extension/production-composition.ts:1639–1651` —
    `collectReservedNames`, the `reservedNames` dep (`:1477`). It collects
    top-level `fn` names and `import` symbols only. Schema and enum names are
    absent, so `theta/load/tool-name-collision` cannot fire against a `schema`
    or `enum` declaration sharing the minted name.
  - `src/extension/production-theta-producer.ts:3600–3620` —
    `presentedCallableNames`, whose snapshot arm (`:3602–3604`) returns the
    frozen keys. Called at `:1212`, `:1493` and `:1739`, each feeding
    `buildBoundEnvironment` (`:3637–3674`), which passes them as `callables`
    (`:3660`).
  - `src/extension/production-theta-producer.ts:3616` — the snapshot-absent
    fallback's own bare-identifier test, which reproduces the Pi-tool arm's
    verbatim derivation and applies no shape rule (see 0106).
  - `src/extension/production-theta-producer.ts:3399–3413` —
    `callableSetPiToolNames`, which reads `toolDefinition.toolName` (`:3409`),
    the HOST name, not the presented key. Consumed at `:1672–1683` for the
    child's PIC-58 `--tools` allowlist and for `inferChildTrust`. Relevant to
    §Fix constraint 2: an auto-derived presented name would not disturb either.
  - `src/runtime/lexical-environment.ts:380–406` — `resolve`. Arm 4 is
    `if (root.callables.has(name)) return { arm: "callable", callable: true };`
    (`:401–404`); `buildEnvironment` is `:548`.
  - `src/parser/theta-document.ts:4505–4519` — `toolCallableName`. Its
    bare-identifier branch (`:4510–4512`) returns the spec verbatim, so the
    minted name enters the whole-file identifier root scope
    (`collectIdentRoots`, `:4557–4561`) and `checkLexicalCallSites`' `callables`
    set (`:5208–5211`). `checkUnknownIdentifiers` (`:4604`) therefore does not
    fire on a call of it.
  - `src/parser/theta-document.ts:4824–4831` — `piToolCallableName`, whose gate
    is the same `/^[A-Za-z_][A-Za-z0-9_]*$/` (`:4827`), so the minted name also
    enters the `piTools` set (`:5204–5207`) and bug 0003's
    `theta/parse/tool-arg-not-object-literal` names it (measured).
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md:81` — "Each entry is
    exposed under a single name in the theta's top-level scope (and to the model
    as a tool of the same name). Naming rules:". `:83` — "For a Pi tool, the
    entry's name is the Pi tool name verbatim." — the one naming bullet that
    states no shape rule. `:84` — the `.theta` bullet, which states the rule
    ("theta identifiers must be lowercase-first identifier-shaped") as the reason
    the hyphen remap exists and names `theta/load/invalid-derived-tool-name`.
    `:85` — "The `as <name>` clause overrides the default for either kind …
    The override target must obey theta's lowercase-first identifier rule". `:86`
    — the collision rule, whose top-level arm names a `fn` declaration or an
    imported symbol. `:78` — the registry-snapshot sentence: "The registry
    snapshot is `pi.getAllTools()`, so a name an installed extension registered
    (`finding_store`, `projection`, …) resolves on the same footing as a host
    built-in — the list above is an open example, not a fixed set".
  - `docs/spec_topics/lexical.md:13` — §Identifiers: `[A-Za-z_][A-Za-z0-9_]*`,
    "The **first letter's case is enforced** by the parser — it is what makes
    case-based pattern disambiguation in `match` work without additional
    grammar". `:15` — PascalCase is required for schema names, enum names, enum
    variant names "and any user identifier introduced as a type-like binding".
    `:16` — lowercase-first is required for `let` / `let mut` bindings, function
    parameters, function names and schema field names. `:18` — "an uppercase
    identifier refers to an existing schema, enum, or constructor in scope", and
    "The casing rule and the import-specifier synthesised-name reservation are
    the only enforced naming constraints".
  - `docs/spec_topics/tool-calls.md:3` — theta code calls a callable "via the
    bare-identifier form `<name>(args)`, where `<name>` is an entry in the
    theta's *callable set*".
  - `docs/spec_topics/diagnostics/code-registry-load.md:31` — the
    `theta/load/invalid-derived-tool-name` row. Its *Trigger* opens "A `tools:`
    `.theta` entry's derived default name — the basename without `.theta`, with
    hyphens rewritten to underscores"; its *Hint* is "Rename the callee file to a
    lowercase-first stem, or name the entry with `as <name>`"; its *Message*
    binds `<path>` to the entry path and reads "derives the default name". `:30`
    — the `theta/load/invalid-tool-rename` row, the sibling that is enforced for
    either kind. `:29` — the collision row. `:26` — `theta/load/unknown-tool`.
    `:25` — `theta/load/malformed-tool-entry`. `:13` —
    `theta/load/extension-tool-unreachable`, the mode-independent code-side
    refusal. Mirrored at `docs/reference/diagnostics.md:188`, `:195`, `:196`.
  - `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:18` — the
    §`tools` rejection-family enumeration both 0069 and 0070 extended.
    `docs/reference/frontmatter.md:119–121` — the user-facing "Pi tool names"
    bullet ("entry name is the Pi tool name verbatim. Unknown →
    `theta/load/unknown-tool`"), `:127–132` the derived-name and `as` mirror,
    `:139` the closed-grammar mirror.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2 — a code
    addition or a *Trigger* change is a spec change routed through the GOV-15
    diagnostic-registry carve-out), `:74` (DIAG-4 — the *Message* column is
    normative and a reword is deferred to theta 2.0);
    `docs/spec_topics/governance/source-language-stability.md:25` (the carve-out
    itself: an addition is in scope "for inputs that did not previously emit the
    added code", a *Message* reword is not).
  - `tests/tools-derived-name-shape.test.ts:656–669` — cell **(C6)**, the
    Pi-tool arm on `read`. `:671–691` — cell **(C6a)**, the Pi-tool arm on
    `WebSearch`, the only cell where 0070's `.theta` conjunct is load-bearing.
    Its comment (`:673–681`) disclaims the shape question outright: "The residual
    gap that leaves is recorded here, not closed: this asserts only that the code
    raises no claim about `WebSearch`, not that an uppercase-first Pi tool name
    is well-formed." Both cells assert `registered === true` and
    `entries.has("WebSearch")`, so both red when this bug is fixed.
  - **The corpus.** Every `tools:` entry in every committed `.theta` /
    `.thetalib` file is lowercase-first: `bash`, `finding_store`, `grep`, `read`,
    `read_file`, `search`, the inline `tools: [read, bash]`, and five `.theta`
    paths. Zero uppercase-first Pi-tool entries. No test outside
    `tests/tools-derived-name-shape.test.ts` (C6a) supplies an uppercase-first
    name to `resolvePiTool` or to a `getAllTools` double.
- **Observed at:** `0.63.0` (HEAD `846c110a`), Windows. Offline, deterministic;
  no live model, no provider. Seven scratch vitest probes driving the real
  `resolveCallableSet`, the real `parseThetaDocument` (production-shaped
  `ParseThetaDocumentDeps` via `tests/helpers/e2e-s1.ts`), the real
  `buildEnvironment`, and the real `discoverAndComposeFixtures` over an on-disk
  `mkdtempSync` workspace with a `getAllTools` double; written, run, deleted.

## Summary

A `tools:` entry's presented name comes from the `as` override or from the
derived default. Bug 0070 closed the derived-default gap for `.theta` entries and
scoped its check to that arm, because the code it registered
(`theta/load/invalid-derived-tool-name`) describes a basename derivation the
Pi-tool arm never performs. The Pi-tool arm's default name stays the host
registry name verbatim, tested by nothing.

The class that reaches it is exactly `[A-Z][A-Za-z0-9_]*`. `isBareIdentifier`
admits `[A-Za-z_]` first; `isLowercaseFirstIdentifier` admits `[a-z_]` first;
the difference is the uppercase-first bare identifier, which routes to the
Pi-tool arm and is bound verbatim. Measured: `tools: WebSearch` against a
registry snapshot containing `WebSearch` resolves `registered=true`,
`keys=["WebSearch"]`, `diagnostics=[]`, and registers through the shipped
`discoverAndComposeFixtures` load path with no notification.

Three consequences, all measured:

- **The same final name is judged two ways.** `WebSearch as WebSearch` is refused
  `theta/load/invalid-tool-rename` ("rename target must be lowercase-first; got
  'WebSearch'"); the identical name arrives through the default source with no
  diagnostic. `WebSearch as websearch` registers under `websearch`. Whichever
  behaviour is intended, one of the two is wrong — the argument 0070 made about
  its own arm, unchanged here.
- **The minted name is not unspellable, which is the correction to 0070's
  residual 3.** `WebSearch` is a lexically valid identifier, so unlike `2fast`
  it reaches the parse-time root scope and arm 4:
  `let r = WebSearch({ query: "x" })?` parses with zero diagnostics,
  `WebSearch("x")` draws `theta/parse/tool-arg-not-object-literal` naming
  `WebSearch` as a Pi tool, and `resolve("WebSearch")` returns
  `{"arm":"callable","callable":true}`. What the minted name is instead is
  *non-conforming*: `lexical.md:15` reserves the uppercase-first spelling for
  type-like names and `:18` states that an uppercase identifier "refers to an
  existing schema, enum, or constructor in scope".
- **The collision rule cannot see the overlap that creates.**
  `collectReservedNames` collects `fn` names and import symbols only, so a
  `schema WebSearch { q: string }` declaration and a `tools: WebSearch` entry
  coexist with no diagnostic; `WebSearch { q: "x" }` constructs the schema and
  `WebSearch({ query: "x" })?` calls the tool, both parse-clean in one file. The
  collision rule is sufficient today only because every callable name is
  lowercase-first and every schema name is PascalCase.

Reachability is bounded and stated exactly. No host built-in can trigger this:
`builtinToolDefinition` is a closed switch over seven lowercase names. The route
is `resolveRegistryExtensionTool`, whose whole test is `tool.name === name`
against the `pi.getAllTools()` snapshot — no shape constraint — and
`frontmatter-fields-a.md:78` states that snapshot is an open set. pi's own
`registerTool` stores a tool under `tool.name` with no name validation, and this
repo's corpus contains no uppercase-first `tools:` entry. So the input requires a
third-party pi extension registering an uppercase-first tool name; nothing in
either codebase prevents one.

The code-side call is refused today for an unrelated reason, and that is the
reason the defect is latent rather than silent: a code-side call of any
extension-registered tool draws `theta/load/extension-tool-unreachable`.
Measured over four planted thetas — uppercase and lowercase host name, prompt and
subagent mode — the refusal fires in all four and names the host tool, so it is
independent of the name's case. A declaration-only theta (`tools: WebSearch`, no
code-side call) registers clean, so the frozen callable set carries the entry and
the model-facing leg proceeds on it per `frontmatter-fields-b-and-templates.md:28`
(not separately measured here).

## Reproduction

Offline at `846c110a`. Two harness shapes: resolver-direct, in the shape of
`tests/tools-derived-name-shape.test.ts` group (C) (a `piTools` stand-in handed
to `resolveCallableSet`); and the shipped production load path,
`discoverAndComposeFixtures(pi, ctx)` over an `mkdtempSync` workspace with
planted `.pi/theta/` files, `.pi/settings.json` = `{}`, a `ctx.ui.notify`
collector, and a `pi.getAllTools()` double.

### Resolver-direct: which registry-name shapes reach the Pi-tool arm

Each row lists the same name in the registry snapshot and in `tools:`.

```
"WebSearch"    registered=true   keys=["WebSearch"]    diags=[]
"Read"         registered=true   keys=["Read"]         diags=[]
"WEBSEARCH"    registered=true   keys=["WEBSEARCH"]    diags=[]
"X"            registered=true   keys=["X"]            diags=[]
"_Under"       registered=true   keys=["_Under"]       diags=[]   [conforming — `_` is lowercase-first]
"web-search"   registered=false  theta/load/unresolvable-theta-path: cannot resolve .theta path 'web-search'
"web.search"   registered=false  theta/load/unresolvable-theta-path: cannot resolve .theta path 'web.search'
"9tool"        registered=false  theta/load/unresolvable-theta-path: cannot resolve .theta path '9tool'
"Web Search"   registered=false  theta/load/malformed-tool-entry: malformed 'tools:' entry 'Web Search'; expected a Pi tool name or a .theta path, optionally followed by an 'as' clause
```

The admitted-and-non-conforming class is exactly the uppercase-first one. The
three `unresolvable-theta-path` rows are `isBareIdentifier` doing what 0070
§Non-goals said it does — routing a non-identifier spec to the `.theta` arm —
and their message misdescribes a Pi-tool name as a `.theta` path (see
§Non-goals).

### Resolver-direct: the asymmetry, and the `.theta` contrast

```
WebSearch                              registered=true   keys=["WebSearch"]   diags=[]
WebSearch as websearch                 registered=true   keys=["websearch"]   diags=[]
WebSearch as WebSearch                 registered=false  theta/load/invalid-tool-rename: 'as WebSearch' rename target must be lowercase-first; got 'WebSearch'
WebSearch, read                        registered=true   keys=["WebSearch","read"]   diags=[]
WebSearch [scalar short form]          registered=true   keys=["WebSearch","read"]   diags=[]
WebSearch [registry snapshot empty]    registered=false  theta/load/unknown-tool: unknown Pi tool 'WebSearch'
WebSearch + reservedNames=["WebSearch"] registered=false  theta/load/tool-name-collision: tool name 'WebSearch' collides with another 'tools:' entry, top-level fn, or import
./2fast.theta                          registered=false  theta/load/invalid-derived-tool-name: 'tools:' entry './2fast.theta' derives the default name '2fast', which must be lowercase-first; rename the file or add an 'as' clause
./Foo.theta                            registered=false  theta/load/invalid-derived-tool-name: … derives the default name 'Foo' …
./ok.theta                             registered=true   keys=["ok"]          diags=[]
```

Row 3 is the asymmetry: the same final name, refused through `as`, admitted
through the default. Rows 8 and 9 are the `.theta` arm since 0070 — an uppercase
stem is refused there. Row 7 shows the collision test is reached, so the
Pi-tool arm's name is a full participant in every later rule; only the shape
rule skips it.

### The production load path

Planted `.pi/theta/`, one run per `getAllTools()` snapshot.

```
getAllTools() = [WebSearch]
  REGISTERED  ["2fast","goodtool","upperpitool","upperrenamed"]
  NOTIFY      ["'tools:' entry './2fast.theta' derives the default name '2fast', which must be lowercase-first; rename the file or add an 'as' clause",
               "extension tool 'WebSearch' is unreachable from theta code: no code-side dispatch rung available",
               "extension tool 'WebSearch' is unreachable from theta code: no code-side dispatch rung available",
               "'as WebSearch' rename target must be lowercase-first; got 'WebSearch'"]

getAllTools() = []                                    [control]
  REGISTERED  ["2fast","goodtool"]
  NOTIFY      [… "unknown Pi tool 'WebSearch'" ×4, "'as WebSearch' rename target must be lowercase-first; got 'WebSearch'"]
```

`upperpitool` is `mode: prompt`, `tools:\n  - WebSearch`, `@`hi``: it registers
with no notification. `upperrenamed` (`WebSearch as websearch`) registers too.
`uppersamerename` (`WebSearch as WebSearch`) does not. `digitdefault`
(`./2fast.theta`) does not. The control run proves the registry arm was live:
with the snapshot empty, every `WebSearch` entry falls to
`theta/load/unknown-tool`.

### The code-side refusal is independent of the name's case

Four planted thetas, one `getAllTools()` snapshot holding both `WebSearch` and
`websearch`, each theta declaring one of them and calling it from code:

```
getAllTools() = [WebSearch, websearch]
  REGISTERED  ["goodtool","pbuiltin","sdeclupper"]
  NOTIFY      ["extension tool 'websearch' is unreachable from theta code: no code-side dispatch rung available",
               "extension tool 'WebSearch' is unreachable from theta code: no code-side dispatch rung available",
               "extension tool 'websearch' is unreachable from theta code: no code-side dispatch rung available",
               "extension tool 'WebSearch' is unreachable from theta code: no code-side dispatch rung available"]
```

`pupper` / `plower` are prompt mode, `supper` / `slower` subagent mode; all four
are refused and the two names behave identically. `pbuiltin` (a code-side call of
the built-in `read`) registers, so the refusal is specific to
extension-registered tools. `sdeclupper` (`mode: subagent`, `tools: WebSearch`,
no code-side call) registers clean — the observable this report is about.

### The minted name at the parse gates

`parseThetaDocument` only; frontmatter `mode: subagent` plus the `tools:` shown.

```
tools: WebSearch      + `let r = WebSearch({ query: "x" })?`   []
tools: WebSearch      + `let r = WebSearch()?`                 []
tools: read           + `let r = WebSearch({ query: "x" })?`   ["error theta/parse/unknown-identifier @6:9: unknown identifier 'WebSearch'",
                                                                "error theta/parse/bare-object-literal @6:19: bare object literal not permitted in this position; name the schema (Schema { ... })"]
tools: WebSearch as websearch + `let r = WebSearch(…)?`        the same two codes
tools: WebSearch      + `let r = WebSearch("x")?`              ["error theta/parse/tool-arg-not-object-literal @6:19: Pi tool 'WebSearch' argument must be written inline as a bare object literal { ... }; a let-bound value cannot supply the field shape"]
tools: read           + `let r = read("x")?`          [control] the same code, naming 'read'
tools: WebSearch      + `let WebSearch = "s"` + call            ["error theta/parse/binding-case-mismatch @6:5: binding name must start with a lowercase letter or _",
                                                                "error theta/parse/shadowed-callable-call @7:9: call of 'WebSearch' resolves to the local let binding at line 6 that shadows the callable-set entry 'WebSearch'; locals are not callable",
                                                                "error theta/parse/bare-object-literal @7:19: …"]
```

The name is in scope: removing it from `tools:` turns the call into
`theta/parse/unknown-identifier`, and renaming it with `as` does the same. Bug
0003's argument-shape gate and bug 0016's shadowing gate both name it as a
callable-set entry. Arm 4 agrees:

```
buildEnvironment({ body: <empty>, callables: ["WebSearch", "read"] })
  resolve("WebSearch") = {"arm":"callable","callable":true}
  resolve("read")      = {"arm":"callable","callable":true}
  resolve("nope")      = {"arm":"unresolved"}
```

### The PascalCase overlap

Every declaration below is written multi-line in the probed source (a
`schema` / `enum` / `fn` body is a braced block on its own lines); the rows
abbreviate it.

```
tools: WebSearch + schema WebSearch (field `q: string`) + `let a = WebSearch { q: "x" }` + `let b = WebSearch({ query: "x" })?`   []
tools: WebSearch + enum WebSearch (variants `A`, `B`) + `let a = WebSearch.A`                                                    []
tools: WebSearch + `let a = WebSearch { q: "x" }`   [no schema declared]   ["error theta/parse/unresolved-named-type @6:9: unresolved named type 'WebSearch'"]
tools: WebSearch + fn WebSearch (returns `string`)                         ["error theta/parse/binding-case-mismatch @6:4: binding name must start with a lowercase letter or _"]
```

One file holds a schema named `WebSearch` and a callable named `WebSearch`, with
both spellings used, and raises nothing. `theta/load/tool-name-collision` cannot
reach it: `collectReservedNames` collects `fn` names and import symbols only. The
`fn` row shows why the collision rule has been sufficient until now — a `fn`
cannot carry this name, so the only in-scope name that can is the callable-set
entry.

## Expected behaviour

- **`frontmatter-fields-a.md:81`** — "Each entry is exposed under a single name
  in the theta's top-level scope (and to the model as a tool of the same name)."
  This is the bullet that heads both naming sources. A name in top-level scope is
  a theta binding, and `lexical.md:16` requires lowercase-first for every binding
  position the page enumerates; `lexical.md:15` requires uppercase-first for
  type-like names. `WebSearch` occupies the second regime while binding in the
  first.
- **`frontmatter-fields-a.md:84`** states the rule and its reason on the `.theta`
  bullet: the hyphen remap "exists because theta-file naming convention favours
  hyphens while theta identifiers must be lowercase-first identifier-shaped".
  The clause after `while` is a statement about theta identifiers, not about
  `.theta` basenames. **`:85`** then enforces it "for either kind" on the `as`
  path. **`:83`** is the one naming bullet with no shape rule — "For a Pi tool,
  the entry's name is the Pi tool name verbatim." The corpus therefore states the
  rule generally, enforces it on one of two name sources per kind, and leaves
  `:83` silent; either `:83` gains the rule or it states the exemption
  explicitly. It does neither today.
- **`lexical.md:13`** — the first letter's case "is what makes case-based pattern
  disambiguation in `match` work without additional grammar", and **`:18`** — "an
  uppercase identifier refers to an existing schema, enum, or constructor in
  scope". A callable-set entry is none of those three. The case regime is what
  makes `frontmatter-fields-a.md:86`'s collision rule sufficient over `fn`
  declarations and imported symbols alone: schema and enum names are excluded
  from it because a lowercase-first callable name cannot collide with a
  PascalCase type name. An uppercase-first callable name breaks that premise, and
  the measured coexistence of `schema WebSearch` with the callable `WebSearch` is
  what that break looks like.
- **`tool-calls.md:3`** — theta code calls a callable "via the bare-identifier
  form `<name>(args)`, where `<name>` is an entry in the theta's *callable set*".
  For `WebSearch` such a bare identifier exists, so the form is reachable; what
  it is not is a spelling the case regime admits at a value position.
- **Bug 0016's finding** — the callable set's presented names are the arm-4
  resolution names (`presentedCallableNames` → `buildBoundEnvironment` →
  `resolve` arm 4, a set-membership test with no shape rule). Arm 4 will match
  whatever the snapshot's keys are, so the snapshot is the only place a shape
  rule can be enforced.
- **`frontmatter-fields-a.md:85` applied consistently.** `WebSearch as WebSearch`
  is refused; `WebSearch` is admitted. One final name, one rule, two verdicts.

## Actual behaviour / root cause

`resolveEntry`'s Pi-tool arm returns the spec unchanged:

```ts
    // A Pi-tool entry's default name is the Pi tool name verbatim.
    return { callable: resolved, defaultName: spec };
```

`src/parser/callable-set.ts:378–379`. `spec` reached this arm through
`isBareIdentifier` (`:433`):

```ts
function isBareIdentifier(spec: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(spec);
}
```

and `defaultName` then flows to the merge point and past the shape check, whose
second conjunct excludes it:

```ts
    if (
      parsed.rename === undefined &&
      resolution.callable.kind === "theta" &&
      !isLowercaseFirstIdentifier(name)
    ) {
```

`:242–246`. The two regexes differ in exactly one position — `[A-Za-z_]` against
`[a-z_]` — so the set of specs that reach the Pi-tool arm and fail the rule is
`[A-Z][A-Za-z0-9_]*`. Nothing narrows it further: `entries.set(name,
resolution.callable)` (`:268`) keys the frozen snapshot by that name, and
`resolveCallableSet` returns `registered: true`.

**The conjunct is correct for the code it guards and wrong as a rule.** 0070's
review round 1 established that `theta/load/invalid-derived-tool-name`'s
registered *Trigger*, *Hint* and `<path>` binding are all false for a Pi tool.
They are: the *Trigger* (`code-registry-load.md:31`) speaks of "the basename
without `.theta`, with hyphens rewritten to underscores", the *Hint* says "Rename
the callee file", and the *Message* says the entry "derives the default name" —
a Pi tool has no file and performs no derivation. Scoping that code away from the
arm was the right call; leaving the arm unruled is the residue.

**The name is reachable, so the consequence is a namespace conflict rather than
an unreachable entry.** `toolCallableName` (`theta-document.ts:4505–4519`)
returns a bare identifier verbatim, so the minted name enters
`collectIdentRoots`' whole-file root scope and `checkLexicalCallSites`'
`callables` set; `piToolCallableName` (`:4824–4831`) applies the same regex, so
it enters the `piTools` set too. All three parse gates therefore treat
`WebSearch` as a Pi-tool callable: `unknown-identifier` stays silent,
`tool-arg-not-object-literal` names it, `shadowed-callable-call` names it.
`presentedCallableNames` (`production-theta-producer.ts:3600`) hands the snapshot
keys to `buildBoundEnvironment` (`:3637–3674`), and arm 4
(`lexical-environment.ts:401–404`) is `root.callables.has(name)`. The whole
resolution chain is name-based with no shape rule anywhere after the resolver.

**What blocks the last step is unrelated to this bug.**
`theta/load/extension-tool-unreachable` refuses a code-side call of any
extension-registered tool (`code-registry-load.md:13`, the mode-independent
fail-closed refusal for code-side extension-tool reach). Measured on four
thetas, upper and lower name, prompt and subagent: all four refused, `read`
(a built-in) not refused. So today the minted name cannot be dispatched from
code — for a reason that has nothing to do with its case, and that a future
PIC-64 rung removes.

**The collision rule cannot cover the overlap the name creates.**
`collectReservedNames` (`production-composition.ts:1639–1651`) collects
`statement.kind === "fn"` names and `import` symbols. Schema and enum
declarations are absent by design: `frontmatter-fields-a.md:86` names only the
`fn` and import arms, and that is sufficient while callable names are
lowercase-first, because `lexical.md:15` forces schema and enum names into the
disjoint uppercase-first space. The measured file holding both a
`schema WebSearch` and a callable `WebSearch` is that disjointness failing, with
no diagnostic at either layer.

**Reachability, stated exactly.** Two admission routes exist for a Pi-tool
name. `builtinToolDefinition` (`production-composition.ts:1670–1692`) is a closed
switch over `grep`, `read`, `find`, `ls`, `bash`, `edit`, `write` — no
non-conforming name. `resolveRegistryExtensionTool` (`:1737–1749`) matches
`tool.name === name` against the `pi.getAllTools()` snapshot with no shape
constraint, and `frontmatter-fields-a.md:78` states that snapshot is an open set
("the list above is an open example, not a fixed set"). The host side imposes no
constraint either: pi's `ToolDefinition.name` is typed `string` and its
`registerTool` stores the definition under `tool.name` unvalidated, while pi's
skill loader does validate a skill name against `/^[a-z0-9-]+$/`
(`dist/core/skills.js:66`) — the absence on the tool path is therefore not an
omission this repo can rely on. Every committed `tools:` entry in this repo
is lowercase-first and no `getAllTools` double outside cell (C6a) supplies an
uppercase-first name. The input is therefore not reachable through this repo's
own registry snapshot and is reachable through any third-party pi extension that
registers an uppercase-first tool name.

## Why it matters

- **One rule, two verdicts on one name.** `WebSearch as WebSearch` is refused at
  load; `WebSearch` is admitted. An author who writes the explicit form is told
  the name is illegal and an author who writes the implicit form is not, for the
  identical presented name. This is 0070 §Why it matters' third bullet, on the
  arm 0070 exempted.
- **The minted name violates the invariant the collision rule depends on.**
  Schema and enum names are outside `theta/load/tool-name-collision` because the
  case regime makes them disjoint from callable names. With an uppercase-first
  callable that disjointness is gone, and the measured result is one file where
  `WebSearch` names both a schema and a tool with no diagnostic from either the
  parser or the resolver.
- **Three parse gates already assert the name is a Pi-tool callable.**
  `theta/parse/tool-arg-not-object-literal` and
  `theta/parse/shadowed-callable-call` both render `WebSearch` as a callable-set
  entry, and `theta/parse/unknown-identifier` is suppressed for it. Whatever the
  resolver decides about the name, those three gates currently take the position
  that it is a legitimate callable.
- **The code-side consequence is latent, not absent.** The parse layer already
  admits `WebSearch({ … })` with zero diagnostics; the only refusal between it
  and a dispatch is `theta/load/extension-tool-unreachable`, a PIC-64 ladder
  fact measured to be independent of the name's case. The name's disposition at a
  value position therefore rests on an unrelated refusal.
- **The exemption is pinned by a test, so no gate will surface it.** Cells (C6)
  and (C6a) assert `registered === true` for `tools: WebSearch`. The state is
  stable and documented as deliberate; only a filing reopens it, which is what
  0070's residual 3 asked for.
- **The corpus states the rule generally and enforces it partially.**
  `frontmatter-fields-a.md:84` gives "theta identifiers must be lowercase-first
  identifier-shaped" as the reason a rewrite exists, `:85` enforces it for either
  kind through `as`, and `:83` admits any registry name verbatim. A reader
  comparing the three cannot derive what `tools: WebSearch` does.

## Non-goals

- **The `as`-target rule** (`theta/load/invalid-tool-rename`,
  `callable-set.ts:202–210`). It is enforced, correct for both kinds, and the
  control this report measures against.
- **The host built-in ladder.** `builtinToolDefinition`'s seven names are all
  lowercase-first; the switch is not widened or narrowed here.
- **`isBareIdentifier`'s arm split.** It is what routes a hyphenated, dotted or
  digit-leading registry name away from the Pi-tool arm, and narrowing it would
  change which diagnostic those names draw. Their current diagnostic is a
  separate defect and is not filed: `tools: web-search` against a registry
  holding `web-search` draws `theta/load/unresolvable-theta-path: cannot resolve
  .theta path 'web-search'`, which describes a Pi-tool name as a `.theta` path
  (measured). This report's fix must not change that message; §Fix constraint 1
  scopes the new rule to the arm the resolver actually took.
- **`theta/load/extension-tool-unreachable`'s own disposition.** It refuses every
  code-side extension-tool call today. Whether and when PIC-64 grows a rung is
  outside this report; the measurement here is only that its firing is
  independent of the name's case, so it is not a fix for this bug.
- **The model-facing name.** `frontmatter-fields-a.md:81` says the entry reaches
  the model "as a tool of the same name", and a host tool's model-facing name is
  the host's. Whether a presented-name override is supposed to rename the tool
  the model sees is a separate question, already reachable through
  `read as file_read`, and is not adjudicated here.
- **0106's grammar axis.** The four-implementation lock-step of the entry
  *grammar* is 0106's. This report shares only the name-shape axis its last
  §Affected bullet records, and §Fix constraint 5 states the seam between them.
- **`.theta`-arm behaviour.** Unchanged and re-measured green: `./2fast.theta`
  and `./Foo.theta` are refused, `./ok.theta` registers.

## Fix

**Apply a lowercase-first rule to the Pi-tool arm's default name, at the same
position 0070's check occupies.** Route not settled; the constraints below are.

1. **The diagnostic disposition is adjudicated in the run, and DIAG-4 bounds
   it.** Two dispositions exist and both are DIAG-2 registry edits, mirrored into
   `docs/reference/diagnostics.md` in the same commit.
   - *A new registered code for the host-name case.* Row in
     `code-registry-load.md` adjacent to `:30`/`:31`, mirror row in
     `docs/reference/diagnostics.md` at the matching relative position, the code
     added to the §`tools` rejection-family enumeration at
     `frontmatter-fields-b-and-templates.md:18` and to
     `docs/reference/frontmatter.md:139`'s neighbourhood — both enumerations 0069
     and 0070 each extended — plus the naming-rule statement at
     `frontmatter-fields-a.md:83` and its mirror at
     `docs/reference/frontmatter.md:119–121`. Its *Message* names the host
     registry name and the `as` escape hatch, and must not speak of a file or a
     derivation.
   - *A `Trigger` / `Hint` generalisation of `theta/load/invalid-derived-tool-name`
     to cover both name origins.* Admissible as a DIAG-2 *Trigger* change, but
     DIAG-4 (`diagnostic-shape.md:74`) defers a *Message* reword to theta 2.0,
     and that row's *Message* is
     `'tools:' entry '<path>' derives the default name '<value>', which must be
     lowercase-first; rename the file or add an 'as' clause`. Rendered for
     `tools: WebSearch` it binds `<path>` to a Pi-tool name, asserts a derivation
     that did not happen, and tells the author to rename a file that does not
     exist — the exact falseness 0070's review round 1 fixed. This disposition is
     therefore only viable if the adjudication finds it can keep the *Message*
     unchanged and true of both input sets, which on the current text it is not.
   Whichever is chosen, the *Trigger* states which arm it covers, and the
   `.theta` row's *Trigger* keeps its own arm.
2. **Refusal versus auto-derivation is decided in the run, with these facts
   pinned.** Refusing the `as`-less entry keeps the author's intent explicit and
   reuses the escape hatch `frontmatter-fields-a.md:85` already documents
   (`WebSearch as websearch` registers cleanly under `websearch` — measured).
   Auto-deriving a conforming presented name mints a name the author never wrote.
   Two facts bear on it: the child's PIC-58 `--tools` allowlist and
   `inferChildTrust` read the HOST name off the snapshot entry
   (`callableSetPiToolNames` → `toolDefinition.toolName`,
   `production-theta-producer.ts:3399–3413`, consumed at `:1672–1683`), so
   auto-derivation does not break either; and `frontmatter-fields-a.md:81` binds
   the presented name to the model-facing name, which for a host tool is the
   host's, so auto-derivation would put the two out of step for this arm alone.
   Auto-derivation is not rejected in advance on the allowlist ground — that
   ground does not hold — but it is the weaker option on the second.
3. **Position: the merge point, before the collision test.** The same binding
   constraint 0070's §Fix carried, and for the same reason:
   `theta/load/tool-name-collision` fires against the merged name (`:258`,
   measured firing for `tools: WebSearch` with `WebSearch` in `reservedNames`),
   so a shape rejection placed after it is masked whenever a top-level `fn` or
   import happens to share the name. The arm discriminant is read off the
   `EntryResolution` the resolver already computed, never re-derived from
   `parsed.spec` — 0069 §Fix constraint 5's hazard class, and the reason 0070's
   arm test is written the way it is.
4. **Cells (C6) and (C6a) are re-pinned, not treated as an unrelated lock.**
   `tests/tools-derived-name-shape.test.ts:656–669` and `:671–691` currently
   assert `registered === true` and `entries.has("WebSearch")` for
   `tools: WebSearch`. (C6a) exists specifically so 0070's `.theta` conjunct
   cannot be removed unwitnessed, and its comment (`:673–681`) already disclaims
   that an uppercase-first Pi tool name is well-formed. Both cells red when this
   bug is fixed; this section pre-authorises editing them, and the fixer keeps
   (C6a)'s function — a cell that reds if the new arm's own scoping is removed —
   rather than deleting it. (C6)'s `read` row stays green untouched.
5. **`presentedCallableNames`' snapshot-absent fallback is decided explicitly.**
   `production-theta-producer.ts:3616` reproduces the Pi-tool arm's verbatim
   derivation with no shape rule, so on this arm the fallback and the resolver
   agree today and a resolver-side refusal makes them disagree — a harness
   fixture with no frozen snapshot would still expose `WebSearch`. Production
   always takes the snapshot arm (`:3602–3604`), so this is not a production
   path; the fix either replicates the rule there or records the divergence
   beside the existing rename-validity and unknown-tool omissions the same
   fallback already carries. It is the same axis as bug 0106's last §Affected
   bullet, and whichever way it goes, the two reports must not both claim it.
6. **The witness is offline and provider-free.** Every row in §Reproduction
   settles inside one `resolveCallableSet` call, one `parseThetaDocument`, one
   `buildEnvironment`, or one `discoverAndComposeFixtures` over an `mkdtempSync`
   workspace with a `getAllTools` double. Required: the uppercase-first entry
   refused with its exact *Message* sourced from the registry column (DIAG-4);
   `WebSearch as websearch` still registering; `read` and the other six built-ins
   still registering; the three already-refused shapes (`web-search`,
   `web.search`, `Web Search`) keeping their current codes so the arm split is
   not disturbed; the ordering pin against `theta/load/tool-name-collision`; the
   `.theta` arm's rows unchanged; and one production-load cell, since no shipped
   test supplies an uppercase-first name to a `getAllTools` double.
7. **GOV-15.** `tools: WebSearch` loads cleanly today (measured: no
   error-severity diagnostic through the production load path), so it is inside
   GOV-15's loads-cleanly input set and the addition falls under the
   diagnostic-registry carve-out for "inputs that did not previously emit the
   added code" (`source-language-stability.md:25`). The census is re-run at the
   fix baseline: measured here, zero uppercase-first Pi-tool `tools:` entries
   across every committed `.theta` / `.thetalib`, and the only uppercase-first
   name reaching a `resolvePiTool` double anywhere in `tests/` is cell (C6a)'s.
   The re-run must reach fixtures that are TypeScript string literals as well as
   committed corpus files.

## Provenance

- Origin: the bug 0070 fix (0.63.0, `846c110a`), §Fix *Residuals* item 3
  (`docs/bugs/0070-theta-callable-default-name-unvalidated.md:470–474`), with its
  §Non-goals bullet (`:181–185`), its round-1 review finding (i)
  (`:396–400`) and its *Pinned dispositions / non-goals* paragraph
  (`:506–511`). This report adds
  what the residual does not state: the exact admitted class
  (`[A-Z][A-Za-z0-9_]*`) and the disposition of every neighbouring shape; the
  production-load observable; the correction that the minted name IS spellable
  and reaches three parse gates and arm 4; the PascalCase overlap the collision
  rule cannot see; the measurement that
  `theta/load/extension-tool-unreachable` fires independently of the name's case;
  and the DIAG-4 constraint that bounds the registry disposition.
- Spec: `docs/spec_topics/frontmatter/frontmatter-fields-a.md:78` (the open
  registry snapshot), `:81` (single name in top-level scope), `:83` (the Pi-tool
  verbatim rule), `:84` (the lowercase-first rule and
  `theta/load/invalid-derived-tool-name`), `:85` (the `as` rule for either kind),
  `:86` (the collision rule and its top-level arm);
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:18` (the
  rejection-family enumeration), `:22` (§Resolution snapshot), `:28` (the
  prompt-mode extension-tool leg); `docs/spec_topics/lexical.md:13`, `:15`,
  `:16`, `:18` (§Identifiers and the case regime);
  `docs/spec_topics/tool-calls.md:3` (the bare-identifier call form);
  `docs/spec_topics/diagnostics/code-registry-load.md:13`
  (`extension-tool-unreachable`), `:25` (`malformed-tool-entry`), `:26`
  (`unknown-tool`), `:29` (`tool-name-collision`), `:30`
  (`invalid-tool-rename`), `:31` (`invalid-derived-tool-name` and its *Trigger*
  / *Hint* / *Message*); `docs/spec_topics/diagnostics/diagnostic-shape.md:72`
  (DIAG-2), `:74` (DIAG-4);
  `docs/spec_topics/governance/source-language-stability.md:9` (the
  loads-cleanly predicate), `:25` (the diagnostic-registry carve-out).
  User-facing: `docs/reference/diagnostics.md:188`, `:195`, `:196`;
  `docs/reference/frontmatter.md:119–121`, `:127–132`, `:139`.
- Implementation at `846c110a`: `src/parser/callable-set.ts` —
  `resolveCallableSet` (`:176`, merge `:222`, shape arm `:242–254` with the
  `.theta` conjunct `:244`, collision `:258`, `entries.set` `:268`),
  `resolveEntry` (`:359`, the arm split `:364`, the verbatim return `:378–379`),
  `thetaDefaultName` (`:422`), `isBareIdentifier` (`:433`),
  `isLowercaseFirstIdentifier` (`:443`), `parseToolsEntry` (`:342`);
  `src/extension/production-composition.ts:1446–1470` (the `resolvePiTool` dep),
  `:1477` (`reservedNames`), `:1639–1651` (`collectReservedNames`),
  `:1670–1692` (`builtinToolDefinition`), `:1737–1749`
  (`resolveRegistryExtensionTool`);
  `src/extension/production-theta-producer.ts:3399–3413`
  (`callableSetPiToolNames`), `:1672–1683` (the child allowlist and trust
  inference), `:3600–3620` (`presentedCallableNames`, fallback shape test at
  `:3616`), `:3637–3674` (`buildBoundEnvironment`), `:1212`, `:1493`, `:1739`
  (its call sites); `src/runtime/lexical-environment.ts:380–406` (`resolve`, arm
  4 at `:401–404`), `:548` (`buildEnvironment`);
  `src/parser/theta-document.ts:4505–4519` (`toolCallableName`), `:4557–4561`
  (`collectIdentRoots`' `tools:` fold), `:4604` (`checkUnknownIdentifiers`),
  `:4824–4831` (`piToolCallableName`), `:5196–5212` (`checkLexicalCallSites`'
  `piTools` / `callables` sets). Host side:
  `@earendil-works/pi-coding-agent` `dist/core/extensions/types.d.ts:339`
  (`ToolDefinition.name: string`) and `dist/core/extensions/loader.js:195–202`
  (`registerTool` stores under `tool.name`, unvalidated).
- Test and corpus evidence at `846c110a`:
  `tests/tools-derived-name-shape.test.ts:656–669` (C6), `:671–691` (C6a, its
  disclaiming comment `:673–681`); `tests/production-tools-load-resolution.test.ts`
  (the production-load harness shape this report's probes reuse — the `pi` /
  `ctx` doubles and the planted `.pi/theta/` workspace);
  `tests/helpers/e2e-s1.ts` (`parseDoc`, the production-shaped parse deps); the
  corpus census over every committed `.theta` / `.thetalib` `tools:` entry
  (`bash`, `finding_store`, `grep`, `read`, `read_file`, `search`, the inline
  `tools: [read, bash]`, five `.theta` paths — all lowercase-first).
- Reproduction: seven scratch vitest probes at `846c110a` — the registry-name
  shape matrix, the asymmetry rows and the `.theta` contrast, two
  `discoverAndComposeFixtures` runs over a planted workspace under two
  `getAllTools()` snapshots, the four-theta code-side matrix across both modes
  and both name cases, the parse-gate rows, the arm-4 resolution rows, and the
  PascalCase-overlap rows. Run on the outputs quoted above, then deleted per
  scratch policy. No file in the tree was written by the probes.
