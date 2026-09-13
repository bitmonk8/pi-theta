---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: progress-tool.ts hand-rolls ANSI/control stripping that node:util already provides, and its regex misses OSC escape-sequence payloads the built-in strips
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/execution-status/progress-tool.ts:99-111
  - src/extension/execution-status/progress-tool.ts:114-117
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: reimplemented      # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/extension/execution-status/progress-tool.ts#stripControlAndAnsi # D8 only: the exemption key, <path> or <path>#<function>
wave: qw20260913174959
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-13
---

# progress-tool.ts hand-rolls ANSI/control stripping that node:util already provides, and its regex misses OSC escape-sequence payloads the built-in strips

## Observation
`stripControlAndAnsi` (progress-tool.ts:109-111) hand-rolls the EXST-14 "ANSI escape sequences and control characters stripped" clamp step with two module-level regexes (`ANSI_PATTERN`, `CONTROL_PATTERN`, lines 99-101). `node:util` exports `stripVTControlCharacters(str)`, a built-in that removes ANSI escape codes from a string, present since Node v16.11.0 — well inside this package's own `engines.node: ">=22.19.0"` pin (package.json:43-45). `clampProgressField` (progress-tool.ts:114-117) is the sole caller, feeding it the raw `message`/`scope` text a `theta_progress` call carries (author- or model-supplied, unconstrained content) before the EXST-14 length clamp is judged.

## Evidence
Facility — `node_modules/@types/node/util.d.ts:1154-1163` (Node's own ambient declaration):
```ts
/**
 * Returns `str` with any ANSI escape codes removed.
 *
 * ```js
 * console.log(util.stripVTControlCharacters('\u001B[4mvalue\u001B[0m'));
 * // Prints "value"
 * ```
 * @since v16.11.0
 */
export function stripVTControlCharacters(str: string): string;
```

Hand-rolled reimplementation — `src/extension/execution-status/progress-tool.ts:99-111`:
```ts
const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]|\u009B[0-?]*[ -/]*[@-~]|\u001B[@-Z\-_]/g;
/** Residual C0 + DEL + C1 after the ANSI pass. Tab is handled before this. */
const CONTROL_PATTERN = /[\u0000-\u001F\u007F-\u009F]/g;

/**
 * EXST-14's strip step: ANSI sequences removed wholesale, a horizontal tab
 * becomes ONE space, every residual control character (newline included — a
 * newline would split the PIC-74 wire line) removed. Ordered strip-then-clamp
 * so a strip can never un-clamp a field.
 */
export function stripControlAndAnsi(s: string): string {
  return s.replace(ANSI_PATTERN, "").replace(/\t/g, " ").replace(CONTROL_PATTERN, "");
}
```
Call site — `src/extension/execution-status/progress-tool.ts:114-117`:
```ts
export function clampProgressField(s: string, max: number): string {
  const stripped = stripControlAndAnsi(s);
  return stripped.length <= max ? stripped : stripped.slice(0, max);
}
```

Feature-for-feature comparison, run against the same inputs immediately before filing (`node -e`, outputs verbatim):
```
input:  "\u001B]8;;http://example.com\u0007link\u001B]8;;\u0007"     (OSC 8 hyperlink, BEL-terminated)
hand-rolled stripControlAndAnsi(input)        => "]8;;http://example.comlink]8;;"
node:util.stripVTControlCharacters(input)     => "link"

input:  "\u001B]0;My Title\u001B\\rest"                                (OSC window-title, ST-terminated)
hand-rolled stripControlAndAnsi(input)        => "]0;My Titleest"
node:util.stripVTControlCharacters(input)     => "y Title\u001b\rest"
```
Both implementations agree on 7-bit CSI colour codes, 8-bit CSI, BEL, tab, and the plain C0/C1/DEL range (also checked); they diverge only on OSC (`ESC ]`) sequences, which is the shape used by terminal hyperlinks and window-title escapes.

Documented intent both mechanisms exist to satisfy — `docs/spec_topics/execution-status.md:47` (EXST-14): "ANSI escape sequences and control characters stripped before the clamp is judged (a horizontal tab becomes one space)"; `docs/spec_topics/pi-integration-contract/subagent.md:154` (PIC-74, parent tap): "the parent MUST re-apply the EXST-14 length clamps and control/ANSI strip before rendering."

## Why this is a problem
`ANSI_PATTERN`'s own doc comment (progress-tool.ts:93-97) states the escape sequence must be removed "WHOLESALE... so a sequence's printable tail... never survives as text," and claims to cover "the two-byte `ESC <Fe>` forms" (its third alternative). That alternative's character class, `[@-Z\-_]` (0x40-0x5A, literal `-`, `_`), excludes `]` (0x5D) — the byte that introduces an OSC (Operating System Command) sequence — so an OSC sequence is not recognised as an escape sequence at all by this pattern, and its printable payload (a URL, a window title) is composed of ordinary printable bytes that `CONTROL_PATTERN`'s C0/C1/DEL sweep does not remove either. The verified comparison above shows the gap concretely: the hand-rolled function leaves `]8;;http://example.com...]8;;` as literal visible text in the clamped `message`/`scope` field the `theta_progress` tool publishes to the execution-status bus and the entry channel (parent regime) or the wire (child regime), while `stripVTControlCharacters` — a facility already guaranteed present by this package's own Node version floor — removes the whole construction. The codebase hand-rolled a narrower mechanism than the one already available in its own runtime dependency for exactly the job EXST-14/PIC-74 assign it.

## Suggested direction (non-binding, optional)
Routing the ANSI-removal step through `stripVTControlCharacters` ahead of the existing tab-to-space and full C0/C1/DEL sweep (neither of which that facility performs, so both would still be needed) is one way to close the gap; named as a hypothesis only.

## False-positive check
Re-read progress-tool.ts:93-117 and re-ran both implementations against the quoted inputs immediately before filing (byte-for-byte outputs above). Searched `src/` for `ANSI_PATTERN`, `CONTROL_PATTERN`, and `stripVTControlCharacters`: the hand-rolled pair is declared and consumed only in this one file (not a duplicated pair — a D4 concern would need a second copy, which does not exist), and `stripVTControlCharacters` is not referenced anywhere in `src/`, so no existing centralised helper is being bypassed. Checked the two tests exercising this clamp, `tests/execution-status-progress-tool.test.ts:222-234` and `tests/execution-status-progress-wire.test.ts:261-269`: both assert only against 7-bit CSI (`\u001B[31m`) and BEL (`\u0007`) inputs; neither constructs nor pins an OSC sequence, so the OSC-leak behaviour is not an asserted, intentional design choice a test protects. Checked EXST-14 and PIC-74's own wording for a narrower, OSC-excluding definition of "ANSI escape sequences": both clauses use the unqualified term, so this is not a case of dropping behaviour a spec clause requires only a subset of. `stripControlAndAnsi` is a live, exported, actively-used function (its only caller, `clampProgressField`, feeds the `theta_progress` tool's per-call clamp in both parent and child regimes), not dead code, so the D2 dead-code precedents do not apply. No D8 exemption is on record for this host (`store.mjs exemptions --lens D8` returned no output for this wave).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified: the OSC-strip gap reproduces byte-for-byte (hand-rolled leaves `]8;;http://example.comlink]8;;` while `util.stripVTControlCharacters` yields `link`), the facility is present since v16.11.0 within the package's >=22.19.0 floor, no D8 exemption is on record, and routing through it drops no EXST-14/PIC-74-required behaviour — but per the D8 rule the simpler shape is a human design call, never confirmed (triage: claude-opus-5)
