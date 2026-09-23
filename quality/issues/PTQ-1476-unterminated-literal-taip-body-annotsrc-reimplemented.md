---
id: PTQ-1476
title: unterminated-literal-params-type-refusal.test.ts hand-rolls TAIL/body/annotSrc byte-identical to e2e-s1.ts's exports it already imports from
lens: D7
status: open
verdict: confirmed
locations:
  - tests/unterminated-literal-params-type-refusal.test.ts:213-231
  - tests/helpers/e2e-s1.ts:127-152
sites: 1
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# unterminated-literal-params-type-refusal.test.ts hand-rolls TAIL/body/annotSrc byte-identical to e2e-s1.ts's exports it already imports from

## Observation
`tests/unterminated-literal-params-type-refusal.test.ts` declares its own
module-private `const TAIL`, `function body(stmt)` and `function
annotSrc(type)`, whose bodies are byte-identical (`body`/`annotSrc`) or
semantically identical (`TAIL`) to the exported `TAIL`, `body`, and
`annotSrc` already shipped from `tests/helpers/e2e-s1.ts`. The file's own
import line already pulls three other names out of that same module
(`expectGroup as expectGroupShared, type DiagnosticCell, parseDoc`), so the
canonical module is open in the file's own import statement while the
fixture builders next to it are re-typed by hand instead of imported.

## Evidence
`tests/unterminated-literal-params-type-refusal.test.ts:1-231` (import line
and local declarations, re-read immediately before filing):
```ts
import { expectGroup as expectGroupShared, type DiagnosticCell, parseDoc } from "./helpers/e2e-s1";
...
const FM = "---\nmode: prompt\n---\n";
const TAIL = "let a = 1\na\n";

function body(stmt: string): string {
  return `${FM}${stmt}\n${TAIL}`;
}
...
function annotSrc(type: string): string {
  return body("let r = @<" + type + ">`hi`");
}
```
(`FM` at line 213, `TAIL` at 214, `body` at 216-218, `annotSrc` at 230-232.)

`tests/helpers/e2e-s1.ts:127-152` (re-read immediately before filing) — the
canonical exports:
```ts
export const FRONTMATTER: readonly string[] = ["---", "mode: prompt", "---"];
const FM = `${FRONTMATTER.join("\n")}\n`;

/** Parse `body` as a `.theta` under the standard frontmatter. */
export function parsePromptBody(body: string, path = "test.theta"): ThetaDocument {
  return parseDoc(FM + body, path);
}

// Fixtures for Type positions. Every body fixture ends `let a = 1` + `a`
// so the theta carries a tail expression; every `params:` fixture carries
// `mode: prompt` so no `theta/load/missing-mode` noise is present.
const TAIL = "let a = 1\na\n";

/** A `mode: prompt` theta whose body is `stmt` followed by the tail. */
export function body(stmt: string): string {
  return `${FM}${stmt}\n${TAIL}`;
}

/** A `mode: prompt` theta whose `params:` block is `block`. */
export function paramsSrc(block: string): string {
  return `---\nmode: prompt\nparams:\n${block}\n---\n${TAIL}`;
}

/** The `@<T>` query annotation — a type-ascription context (grammar.md:105). */
export function annotSrc(type: string): string {
  return body("let r = @<" + type + ">`hi`");
}
```

The file's own header comment at lines 207-211 states this fixture
vocabulary is shared with a sibling: "Fixtures, in the vocabulary of the
landed sibling witnesses (tests/escaped-quote-inline-field-name-refusal.test.ts).
Every body fixture ends `let a = 1` + `a`, and every fixture carries `mode:
prompt`." — the shared vocabulary the comment describes is exactly what
`tests/helpers/e2e-s1.ts` already exports under these same names.

## Why this is a problem
`body` and `annotSrc`'s bodies are character-for-character identical to the
exported functions of the same name in `tests/helpers/e2e-s1.ts`, a module
this file already imports three other names from in the same import
statement. `TAIL`'s literal value (`"let a = 1\na\n"`) is also identical.
This is copy-paste re-implementation of fixtures where the canonical helper
is not merely available under `tests/helpers/` but is open in the file's own
import line — the file chose to retype the bodies rather than widen the
existing `import { ... } from "./helpers/e2e-s1"` to include them.

## Suggested direction (non-binding, optional)
Widening the file's existing `e2e-s1` import to include `body` and
`annotSrc` (and dropping the local `TAIL`/`body`/`annotSrc` declarations) is
observed as available without adding a new import statement, since the
module is already imported by name.

## False-positive check
- gate-pin: the file is not named `*gate*.test.ts` and carries no pinned
  census/inventory count subject to the gate carve-out for this
  observation.
- recording-double: `body`/`annotSrc`/`TAIL` are plain string builders, not
  doubles or recording fakes; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "unterminated-literal-params-type-refusal" docs/bugs/`
  returns no hit; this file is not a documented correct-reason red and this
  finding is not about redness.
- coverage-matrix/bug-doc citation search: `grep -n
  "unterminated-literal-params-type-refusal" docs/reference/coverage-matrix.md`
  returns no hit, so no rename/merge/delete citation constraint applies; this
  finding proposes no rename or delete of the test file itself, only reuse
  of an existing helper's fixture builders.
- coverage drift: this finding does not claim any behaviour is untested; it
  is confined to the test file's own duplicated fixture-construction code.

## Triage
<!-- triage appends its note below this line -->
verdict: confirmed — excerpts reproduce: local `body` (test:216-218) and `annotSrc` (test:230-232) are character-identical to `export function body`/`annotSrc` at tests/helpers/e2e-s1.ts:141-143/151-153, local `FM`/`TAIL` (test:213-214) equal e2e-s1's values, and the file already imports from `./helpers/e2e-s1` at line 11; one correction — e2e-s1's `TAIL` is module-private (`const TAIL`, e2e-s1.ts:138), not exported, so the local `TAIL` only goes if the local `paramsSrc(type)` also migrates to the exported `paramsSrc(`  p: '${type}'`)`, which composes the identical string (the form e2e-s1's own `typePositions` uses at :171); D7 copy-paste-fixture class in tests/, no gate/recording-double/coverage-matrix carve-out applies, and the only existing issue on this file (PTQ-1378) is the unrelated `msg()` root cause (triage: claude-fable-5-1)
