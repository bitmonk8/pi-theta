# Bug 0406 — `toSystemParamType` classifies inline-object-typed, imported-schema-typed, and recursive-schema-field params as `string`-kind, so a spec-valid `${param.field}` in `system:` draws a spurious `theta/parse/system-interp-bad-field` refusal and a spec-valid `${param}` renders the literal `[object Object]` into the child's system prompt

- **Status:** open.
- **Sev/Diff estimate:** S1/D3 — `[object Object]` silently reaches the child's system prompt (the surface conditioning every turn) with zero diagnostics, and three ordinary legal spellings are refused with a false diagnostic; §Fix is undecided between the full field-carry route and an opaque-object stopgap, with frontmatter/import ordering and 01→2 sequencing constraints.
- **Kind:** defect — two faces of one misclassification: an over-refusal of
  paths the `system:` grammar admits ("each subsequent `.Ident` must name a
  reachable field of an *object* schema in the theta-side `params:`
  declaration",
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:42`), and
  the exact `String(...)`-shaped prompt corruption QRY-18 says the
  static-type table exists to prevent
  (`docs/spec_topics/query/query-escapes-stringification.md:16`).
- **Related:**
  - 0298 (fixed 0.300.0) — the `system:` node-kind hole; this report is the
    value-classification sibling one seam deeper (the field parses, the
    template's *type model* is wrong).
  - 0035 (fixed) — established that an inline-object `params:` RHS reaches
    `parseParams` as its own source bytes; the `system:` seam consumes the same
    `typeSource` and does not parse it.
  - [0041](./0041-params-block-mapping-rhs-silent-permissive.md) (fixed
    0.51.0) — its §Non-goals names this seam as a named-but-unfiled gap: the
    string fall-through "mis-types the legal flow-mapping spelling
    identically (fixture L). That is a separate, unfiled gap at that seam".
    This report is that gap's filing.
  - [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md)
    (fixed) — its §Non-goals holds the same fall-through out of scope
    ("cites it only as the third consumer of the recorded text"); its landed
    fix refuses junk `params:` type text at load
    (`theta/load/params-type-not-expression`), narrowing the fall-through's
    legitimate residents.
  - [bug 0407](./0407-system-interp-object-render-skips-wire-translation.md) — the sidecar omission on the branch that
    DOES classify as object; different root cause, same construction site.
- **Affected** (verified at c2c25d81, v0.398.0):
  - `src/parser/frontmatter.ts:824–871` — `toSystemParamType`: an inline
    object type (`{name: string, role: string}`) matches no arm and falls to
    the terminal `return { kind: "string" }` (`:870`); an imported schema name
    is only looked up in `bodyTypes.schemas` (`:856`), which
    `collectBodyTypes` populates from body `schema` decls alone
    (`src/parser/theta-document.ts:1553–1568` — imports land in the name-only
    `imports` set), so it falls to `:870` too; a recursive schema field hits
    the `seen` guard and returns `{ kind: "string" }` at `:867`.
  - `src/parser/system-interpolation.ts:363–378` — the `.Ident` step on a
    non-`object` kind pushes `theta/parse/system-interp-bad-field`; with the
    misclassified head/step type this fires on paths the grammar admits.
  - `src/render/query-render.ts:402` — the `string` row is `value as string`
    with no runtime check; `renderSystemPrompt`'s `text += rendered.text`
    (`src/parser/system-interpolation.ts:474–486`) coerces the object to
    `[object Object]`.
  - `src/extension/production-theta-producer.ts:2197–2211, 2432` — the
    corrupted render is installed as the child's `--system-prompt`.
- **Observed at:** v0.398.0 (c2c25d81). Offline, deterministic: scratch vitest
  over `parseThetaDocument` via `tests/helpers/e2e-s1.ts` `parseDoc` plus a
  direct `renderSystemPrompt` call with the params object the spawn site
  builds (run and deleted).

## Summary

The `system:` interpolation surface models each param's static type with
`toSystemParamType`. Three type spellings the `params:` grammar admits and
whose runtime values are objects — an inline object type, a `NamedType`
imported from a `.thetalib`, and a recursive schema's self-typed field — all
collapse to `{ kind: "string" }`. Downstream that one wrong kind produces two
divergent observables: a `.Ident` step off such a param is refused with
`theta/parse/system-interp-bad-field` (the theta does not register, and the
diagnostic's claim — the field "does not name a reachable object field" — is
false), and a bare `${param}` registers cleanly but renders through the
`string` row's unchecked `value as string`, concatenating JavaScript's
`[object Object]` into the spawned child's system prompt.

## Reproduction

At c2c25d81, offline, each row one file parsed through `parseDoc`
(`---` fences, body as stated):

| params / body | `system:` | observed |
|---|---|---|
| `author: '{name: string, role: string}'` | `'Hi ${author.name}'` | `E theta/parse/system-interp-bad-field :: 'system:' interpolation '.name' does not name a reachable object field on author`; theta not registered |
| `author: {name: string, role: string}` (flow map) | same | same |
| `author: Author` + body `import { Author } from "./types.thetalib"` | same | same (and NO `theta/parse/unresolved-named-type` — the name resolves; only its fields are invisible) |
| `n: Node` + body `schema Node { name: string, child: Node }` | `'Node ${n.child.name}'` | `E …system-interp-bad-field :: '.name' does not name a reachable object field on n.child` |
| `author: '{name: string, role: string}'` | `'Hi ${author}'` | registers; template part `{"kind":"path","segments":["author"],"type":{"kind":"string"}}`; `renderSystemPrompt` with `{author:{name:"Ada",role:"dev"}}` → `"Hi [object Object]"` |
| `n: Node` (recursive, as above) | `'${n.name} ${n.child}'` | registers; render with a populated node → `"root [object Object]"` |

Control: the same `${author.name}` with `Author` declared as a body `schema`
in the same file parses clean and renders the field value.

## Expected behaviour

- `frontmatter-fields-b-and-templates.md:42` (*Path grammar*): "each
  subsequent `.Ident` must name a reachable field of an *object* schema in
  the theta-side `params:` declaration … `${param.field}` is only allowed
  when the resolved type one step in is an object." An inline object type
  declares its fields in the `params:` declaration itself
  (`frontmatter-fields-a.md:58`: "The inline object type (`{a: Triage}`) is a
  YAML flow mapping and is admitted"); an imported schema is a resolvable
  `NamedType` (`frontmatter-fields-a.md:58`: resolution covers "any symbols
  imported from `.thetalib` files"); a recursive schema is legal
  (`docs/spec_topics/schemas.md:145`: "a recursive schema definition is
  fine") and the path grammar has "no depth bound — arbitrary chains of
  `.Ident` are accepted" (`frontmatter-fields-b-and-templates.md:42`).
  All four refused rows are therefore admitted paths.
- `query-escapes-stringification.md:16` (QRY-18): rendering is by Theta
  static type, "*not* by JavaScript's default `String(...)`, whose
  `[object Object]` … defaults would silently corrupt prompts"; the
  Schema-typed-object row renders compact JSON. `${author}` should render
  `{"name":"Ada","role":"dev"}` (modulo [bug 0407](./0407-system-interp-object-render-skips-wire-translation.md)'s
translation gap),
  never `[object Object]`.
- `docs/spec_topics/diagnostics/code-registry-parse.md:131` pins
  `system-interp-bad-field`'s Trigger to a
  step that "does not name a reachable theta-side `params` object field" —
  `.name` on `{name: string, …}` names one, so the code fires outside its
  registered trigger (a diagnostic that lies about the author's text).

## Actual behaviour / root cause

`toSystemParamType` (`frontmatter.ts:824–871`) recognises: `array<…>` /
other generics, top-level `|` unions, the five primitive spellings, body
enums, and body schemas. Everything else — including the three object-valued
spellings above — takes `return { kind: "string" }`. The doc-comment calls
the fallback deliberate for "any other / unresolved atom", but the three
input classes here are neither unresolved nor atoms:

- inline object types are admitted by `paramValueCanCarryType` and arrive as
  their own source text (`frontmatter.ts:1060–1071`), which no arm parses;
- imported schemas resolve (no `unresolved-named-type` fires) yet
  `collectBodyTypes` never carries their fields
  (`theta-document.ts:1553–1568`);
- the recursion guard substitutes `string` for the self-typed field rather
  than an object kind without descent (`:858–867`).

The wrong kind then feeds both consumers: the parse-time `.Ident` walk
(`system-interpolation.ts:363–378`, spurious refusal) and the resolve-time
renderer (`query-render.ts:402`, unchecked cast → `[object Object]` via
string concatenation at `system-interpolation.ts:483–485`).

## Why it matters

- The refusal face un-registers thetas that are valid under three ordinary
  authoring patterns (inline param objects, shared `.thetalib` types,
  recursive trees), with a diagnostic whose message asserts something false
  about the author's declaration.
- The corruption face is worse: it loads with zero diagnostics and every
  query in the spawned conversation runs under a system prompt containing
  `[object Object]` where the author's context object was promised — the
  exact silent-prompt-corruption class QRY-18's table was specified to
  eliminate, on the one surface (the fixed system prompt) that conditions
  every turn of the child.

## Non-goals

- The missing wire-name translation on the correctly-classified body-schema
  branch — [bug 0407](./0407-system-interp-object-render-skips-wire-translation.md) (different root cause).
- Scalar-union params routed to the JSON row — candidate
  system-templates/03.
- `theta/parse/unresolved-named-type` for genuinely undeclared names — fires
  correctly; the deliberate permissive fallback for those stays.

## Fix

Not yet decided between: (a) parse the inline-object `typeSource` through the
same inline-object machinery `parseParams` already runs and build real
`fields` maps; carry imported schemas' fields into `FrontmatterBodyTypes`
(the import walk already parses the `.thetalib` — see
`checkThetaImports`); and represent a recursion cut as
`{ kind: "object", fields: <lazy/empty> }` rather than `string`; or (b) a
narrower stopgap: a distinct `{ kind: "opaque-object" }` that admits no
`.Ident` (keeping today's refusal for steps) but renders through the
object/JSON row (killing `[object Object]`). Any fix must keep: `${param}`
admitted for every declared param; `bad-field` still firing for genuinely
absent fields; no new diagnostic on the already-refused
`params-type-not-expression` cascade (bugs 0041 and 0059 — 0059 widened the
same refusal to brace-free junk text, so the fall-through's remaining
legitimate residents are narrow and the fix must not re-open that refused
class). Sequencing: this fix creates `kind: "object"` values on new
branches, so landing it before [bug 0407](./0407-system-interp-object-render-skips-wire-translation.md) widens that
candidate's blast radius — fix 01→02 or both in one pass. Constraint for (a):
the imported-fields carry must not force import resolution into
frontmatter-parse ordering — `checkSystemInterpolation` runs before the
import checks today; either move the `system:` check after import
resolution or accept a two-pass template validation.

## Provenance

Fresh find. Probed at c2c25d81 with scratch vitest
`tests/scratch-system-templates.test.ts` (rows above; deleted). Spawn-side
threading (`--system-prompt`) verified by code read at
`production-theta-producer.ts:2197–2211, 2432`.
