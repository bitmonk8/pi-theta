# Bug 0320 — the `tools:` half of `theta/parse/invoke-non-theta-extension` is unenforced: a `tools:` entry naming a non-`.theta` path is never extension-checked, so a `.txt` file whose contents parse as a subagent theta registers silently as a live callable, and a valid `.thetalib` entry draws the wrong code (`theta/load/callee-has-errors` with empty `related`) instead of the parse error three spec pages assign to both surfaces

- **Status:** open.
- **Sev/Diff estimate:** S2/D2 — S2 on "silent permissive acceptance": the
  registry row's Trigger names two surfaces ("An `invoke(...)` literal **or a
  `tools:` `.theta` entry** whose path string does not end in `.theta`",
  `code-registry-parse.md:17`), the invoke-literal surface rejects at parse
  (E), and the sibling `tools:` surface accepts the same wrong-extension input
  with zero diagnostics whenever the file's bytes happen to parse as a
  subagent theta — the caller registers a callable over a file the extension
  rule exists to keep out of the callable set, exposed to both the model and
  theta code (`frontmatter-fields-a.md:74`). When the bytes do NOT parse as a
  theta (the ordinary `.thetalib` case), the author gets a diagnostic, but the
  wrong one: `theta/load/callee-has-errors` ("callee './helper.thetalib' has
  errors; see related diagnostics", `related: []`) — a message asserting the
  callee is broken when the callee is a perfectly valid library file and the
  actual defect is the entry's extension. Not S1: no value corrupts and
  nothing crashes. D2: the checker for exactly this input already exists with
  a `surface: "tools"` arm (`checkInvokeExtension`,
  `src/parser/invoke-diagnostics.ts:561`) and `validatePathLiteral` already
  takes `kind: "tools"` (`src/lexer/literals.ts:35`); the fix is one call at
  the `tools:` entry-resolution seam plus witnesses.
- **Kind:** defect — a rule enforced at one position and absent at the
  spec-named sibling position. Elements at `ee681f7b` (v0.287.0):
  1. *The rule names both surfaces.* `code-registry-parse.md:17`
     (`theta/parse/invoke-non-theta-extension`, E, parse): "An `invoke(...)`
     literal or a `tools:` `.theta` entry whose path string does not end in
     `.theta`." `invocation.md:10`: "The same code applies to `tools:`
     `.theta` entries whose path string does not end in `.theta`."
     `frontmatter-fields-a.md:79`: `tools:` `.theta` paths "must end in
     `.theta` — the extension match is byte-exact lowercase … (otherwise
     `theta/parse/invoke-non-theta-extension` for the parse-time literal
     check, or `theta/load/unresolvable-theta-path` for a literal that ends in
     `.theta` but resolves to no file)".
  2. *Only the invoke-literal emitter exists.* The one production emitter is
     `validatePathLiteral` (`src/lexer/literals.ts:63`, push at `:101`),
     called with `kind: "import"` (`src/parser/theta-document.ts:3750`) and
     `kind: "invoke"` (`:5553`) — never with `kind: "tools"`, though the
     `PathLiteralKind` union declares it (`literals.ts:35`). The parser-side
     checker with an explicit `surface: "tools"` arm (`checkInvokeExtension`,
     `src/parser/invoke-diagnostics.ts:561`; surface type at `:542`) has no
     caller anywhere in `src/` — bug 0137 §Non-goals recorded that dead body
     but judged the code reachable because the lexer emits it, an analysis
     that covered the invoke-literal surface only.
  3. *The `tools:` resolution path never looks at the extension.*
     `resolveEntry` (`src/parser/callable-set.ts:379`) classifies any
     non-bare-identifier spec as a "`.theta` path entry" (`:402`) and proceeds
     straight to the parse-cache lookup; no extension check exists between
     `parseToolsEntry`'s closed two-shape grammar (which accepts any
     `<spec> ('as' <name>)?`) and callee resolution.
  4. *Measured end-to-end through the shipped composition root* (probe below):
     a `tools:` entry `./masq.txt` whose file contains a valid subagent theta
     document **registers with zero diagnostics**; a `tools:` entry
     `./helper.thetalib` whose file is a valid `.thetalib` draws
     `theta/load/callee-has-errors` with `related: []`; the control
     `invoke("./masq.txt")` in a body correctly draws
     `theta/parse/invoke-non-theta-extension`.
- **Related:**
  - **0137** (fixed 0.78.0) — its §Non-goals names `checkInvokeExtension`'s
    dead body and declines to file it because the code "**is** reachable —
    emitted inline from `src/lexer/literals.ts:101`". True for the
    invoke-literal surface; this report is the `tools:` half that census did
    not cover.
  - **0110** (fixed) — `tools:` entry containment; sibling load-time gap on
    the same entry-resolution seam, different rule.
  - **0270/0271/0280** (fixed) — the callee-has-errors machinery this input
    falls through to; none of them concerns the extension rule.
- **Affected** (verified at `ee681f7b`, v0.287.0):
  - `src/parser/callable-set.ts:379–435` (`resolveEntry` — no extension check
    on the `.theta`-path arm), `:458–460` (`isBareIdentifier`, the only
    classifier between "Pi tool" and "theta path").
  - `src/parser/theta-document.ts:3750`, `:5553` — the only two
    `validatePathLiteral` call sites (`"import"`, `"invoke"`).
  - `src/lexer/literals.ts:35` (`PathLiteralKind` declares `"tools"`),
    `:63–110` (`validatePathLiteral`, the dormant `"tools"` capability).
  - `src/parser/invoke-diagnostics.ts:542`, `:561–579`
    (`checkInvokeExtension` with the uncalled `surface: "tools"` arm).
  - Spec: `docs/spec_topics/diagnostics/code-registry-parse.md:17`;
    `docs/spec_topics/invocation.md:10`;
    `docs/spec_topics/frontmatter/frontmatter-fields-a.md:79`.
- **Observed at:** v0.287.0 (`ee681f7b`). Offline, deterministic,
  provider-free: one scratch vitest probe planting a `.pi/theta/` workspace
  and composing through the SHIPPED `composeExtensionInstance`
  (`tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts`
  harness pattern); written, run, deleted. Registered set and note payloads
  quoted verbatim below.

## Summary

The byte-exact lowercase `.theta` extension rule is stated three times for
two surfaces — `invoke(...)` literals and `tools:` `.theta` entries — with
one diagnostic code covering both. The implementation enforces it only at
the invoke-literal position (the lexer's `validatePathLiteral`, reached from
the expression parser). The `tools:` value is YAML, parsed by
`resolveCallableSet`, whose per-entry resolver classifies every
non-bare-identifier spec as a theta path and goes straight to callee
resolution; nothing on that route reads the extension. The checker written
for this exact input (`checkInvokeExtension`, `surface: "tools"`) is dead
code.

Consequently the outcome for a wrong-extension `tools:` entry is decided by
the named file's *contents*, not by the rule:

| `tools:` entry | file contents | spec disposition | shipped disposition |
| --- | --- | --- | --- |
| `./masq.txt` | valid subagent theta document | `theta/parse/invoke-non-theta-extension` (E), caller un-registers | **registers clean, zero diagnostics** |
| `./helper.thetalib` | valid `.thetalib` library | same parse error | `theta/load/callee-has-errors` — "callee './helper.thetalib' has errors; see related diagnostics", `related: []` |
| `invoke("./masq.txt")` (control) | — | `theta/parse/invoke-non-theta-extension` | `theta/parse/invoke-non-theta-extension` ✓ |

Row 1 is silent permissive acceptance: the parent registers a live callable
(model-facing and code-facing per `frontmatter-fields-a.md:74`) over a
non-`.theta` file. Row 2's diagnostic is a lie in both fields: the named
callee has no errors (it is a valid library file the `import` surface would
accept), and the empty `related` array points at nothing — the author is
told to "Open the callee and fix the listed errors" when the fix is the
entry's extension.

## Reproduction

Offline, provider-free, at `ee681f7b`. Scratch vitest probe (written, run,
deleted): plant under `<tmp>/.pi/theta/`:

- `helper.thetalib` — `fn double(x: number): number { x * 2 }`
- `masq.txt` — `---\nmode: subagent\ndescription: masq callee\n---\nlet a = 1`
- `callerlib.theta` — prompt mode, `tools:\n  - ./helper.thetalib as helper`
- `callertxt.theta` — prompt mode, `tools:\n  - ./masq.txt as masq`
- `callerinv.theta` — prompt mode, body `invoke("./masq.txt")?`

Compose via `composeExtensionInstance(hostPi, loadCtx, undefined, new
RendererGate())` (recording `pi.sendMessage`). Observed verbatim:

```
REGISTERED: ["callertxt"]
NOTE: …/callerinv.theta:4:8: theta/parse/invoke-non-theta-extension: invoke path './masq.txt' does not end in .theta
NOTE: …/callerlib.theta:1:1: theta/load/callee-has-errors: callee './helper.thetalib' has errors; see related diagnostics
      details.diagnostics[0].related: []
```

`/callertxt` registered with no row on any channel.

## Expected behaviour

- `code-registry-parse.md:17`: `theta/parse/invoke-non-theta-extension` (E,
  parse) fires for "a `tools:` `.theta` entry whose path string does not end
  in `.theta`", "on the path literal as written (no realpath normalisation)",
  byte-exact lowercase.
- `invocation.md:10`: "The same code applies to `tools:` `.theta` entries
  whose path string does not end in `.theta`."
- `frontmatter-fields-a.md:79`: the parse-time literal check owns the
  wrong-extension case; `theta/load/unresolvable-theta-path` is scoped to "a
  literal that ends in `.theta` but resolves to no file".
- Both `callertxt` and `callerlib` must fail registration on that E-severity
  row; neither input reaches callee parsing at all.

## Actual behaviour / root cause

The rule's one production emitter is positioned in the expression/lexer
layer, which frontmatter never flows through. `resolveEntry`
(`callable-set.ts:379`) has exactly two entry classes — bare identifier
(Pi tool) and everything else (theta path) — and the theta-path arm's first
consultation of the file is the parse-cache lookup, so the verdict is
whatever callee parsing yields: a clean subagent parse registers; a parse
failure routes to the bug-0267/0270 callee-has-errors machinery, which
frames the wrong-extension input as a broken callee. The purpose-built
checker `checkInvokeExtension(surface: "tools")` and the
`validatePathLiteral(kind: "tools")` capability are both dead.

## Why it matters

- The extension rule is the only thing keeping non-theta files out of the
  callable set; on the `tools:` surface it is decided by content sniffing
  instead. A file deliberately or accidentally shaped like a theta (`.txt`,
  `.md` with YAML frontmatter, a `.thetalib` that grows frontmatter) becomes
  a live callable with zero diagnostics — exposed to the model as a tool.
- The `.thetalib` case is the ordinary authoring confusion the rule's own
  hint anticipates ("use `import` for `.thetalib` library code",
  `code-registry-parse.md:17` Hint column) — and the shipped diagnostic
  instead reports the library file as erroneous with an empty `related`
  list.
- The invoke-literal twin makes the divergence author-visible and
  inconsistent: the same wrong path is E-rejected in a body and accepted in
  frontmatter.
- A conformance test for the registry row's `tools:` clause cannot be
  written green at this HEAD.

## Non-goals

- The invoke-literal surface (`validatePathLiteral(kind: "invoke")`) is
  conformant and untouched.
- `theta/load/unresolvable-theta-path` for missing `.theta`-suffixed files,
  containment (`theta/load/invoke-path-escape`), and callee-has-errors for
  genuinely broken `.theta` callees are all correct and out of scope.
- Whether `checkInvokeExtension`'s dead body should be the wired checker or
  deleted in favour of `validatePathLiteral(kind: "tools")` is the fix's
  choice, not a claim here.

## Fix

Not yet decided; constraints any fix must satisfy:

1. A `tools:` entry whose spec is not a bare identifier and does not end in
   byte-exact lowercase `.theta` must draw
   `theta/parse/invoke-non-theta-extension` (E) with the registry Message
   (`invoke path '<path>' does not end in .theta`) and un-register the
   caller, before any callee read or parse (the parse-time literal check of
   `frontmatter-fields-a.md:79`). Natural seam: `resolveEntry`'s theta-path
   arm (`callable-set.ts:402`) or its caller, invoking either
   `checkInvokeExtension({ surface: "tools", … })` or
   `validatePathLiteral(kind: "tools")` — one of the two dormant checkers
   should be deleted with the wiring so the surface has one owner.
2. The `masq.txt` and `helper.thetalib` probe cells above become committed
   witnesses, red at this HEAD (one asserting non-registration + the row,
   one asserting the row replaces callee-has-errors).
3. No behaviour change for bare-identifier Pi-tool entries or for
   `.theta`-suffixed specs (existing suites: callable-set, 0270/0271/0280
   witnesses stay green).
4. No new diagnostic code (DIAG-2): the registered row already covers the
   input.

## Provenance

Dead-arms-sweep bug hunt, worktree `C:/UnitySrc/pi-theta-hunt` at `ee681f7b`
(v0.287.0). Surfaces read: `resolveEntry`/`parseToolsEntry`
(`callable-set.ts`), `validatePathLiteral` (`literals.ts`) and its two call
sites (`theta-document.ts`), `checkInvokeExtension`
(`invoke-diagnostics.ts`), the 0270-family callee probing
(`production-composition.ts`); spec `code-registry-parse.md:17`,
`invocation.md:10`, `frontmatter-fields-a.md:79`, bug 0137 §Non-goals.
Probe: scratch workspace composed through the shipped
`composeExtensionInstance`, run and deleted; outputs quoted verbatim.
