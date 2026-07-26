# RFC 0007 — Fail-closed observability on the print-mode surface

- **Status:** draft

## Summary

On `pi -p` (text mode) a theta that fails — at load or at run — is invisible:
load-refusal diagnostics and the SLSH-3 top-level-`Err` system note render only
in the TUI (and, as a `theta-system-note` custom message, in `--mode json`), and
the process exits `0`. Worse, a slug whose theta failed to load falls through to
the ordinary coding agent, which *attempts the prompt itself*. This RFC proposes
(1) mirroring theta diagnostics and the top-level-`Err` note to stderr in
non-interactive modes, (2) an opt-in strict mode that makes those conditions
exit non-zero and refuse the fallthrough, and (3) a supported no-model
lint/check entry point.

## Motivation

Three failure modes observed while running production-shaped thetas under
`pi -p` (pi-config theta-migration verification, 0.12.0):

1. **Silent top-level `Err`.** A prompt-mode theta whose first statements are
   code-side tool calls failed before its first query (`?` propagated a
   `CodeToolError`); under text-mode `-p` the process printed **nothing** and
   exited `0`. The SLSH-3 note exists — `theta /<name> returned Err: tool …` —
   but reaches no print-mode channel. The failure was only diagnosed by
   re-running under `--mode json` and reading the `theta-system-note` custom
   message.
2. **Un-registered slug falls through to the coding agent.** A theta with a
   parse error does not register; `pi -p "/slug"` then treats the slash text as
   an ordinary prompt. In one observed run the fallthrough agent spent five
   minutes attempting the task by hand and created a 14-file debris directory
   before an external timeout killed it. The spec already names this hazard —
   "under `pi -p` an un-registered slug falls through to the ordinary agent and
   *looks* like it worked" (PIC-64 rung 3 rationale) — but the mitigation
   (precise load diagnostics) is invisible on exactly that surface.
3. **No supported parse gate.** The only no-model lint path is importing
   `parseThetaDocument` from `src/` with hand-stubbed dependencies. It works,
   but it is an internal API, it cannot see load-phase diagnostics (callable-set
   resolution, extension-tool reachability), and its diagnostics-vs-exit-code
   behaviour is whatever the caller scripts.

All three push authors toward the same discipline — lint by internal API before
every run, use json mode, parse event streams — which automation against the
documented `-p` surface should not require.

## Proposal

Three additive pieces; no language-surface change.

### 1. Diagnostic mirroring in non-interactive modes

When pi runs non-interactively (`-p`, any `--mode` other than the TUI), the
theta extension writes to **stderr**:

- every error-severity load/parse diagnostic for discovered thetas, at startup,
  in the existing serialised diagnostic line format
  (`<file>:<line>:<col>: <code>: <message>`);
- the SLSH-3 per-`kind` system-note line (the existing SNK templates) when a
  slash-dispatched theta resolves top-level `Err` or is cancelled.

stderr keeps the stdout event/envelope channel clean (PIC-59's stray-line
tolerance is unaffected). Interactive behaviour is unchanged.

### 2. Strict dispatch (opt-in)

A setting (`theta.strict`) and CLI flag (`--theta-strict`):

- If the `-p` prompt is a single slash command whose slug matches a
  **discovered-but-refused** theta (a `.theta` file exists for the stem in a
  discovery source but did not register), the run fails fast: the load
  diagnostics print to stderr and the process exits non-zero. No fallthrough to
  the coding agent.
- If a dispatched theta resolves top-level `Err` (SLSH-3 boundary), the process
  exit code is non-zero after the note is emitted.

Default remains today's behaviour: strictness is the operator's choice, since
the fallthrough is legitimate when the prompt was never meant to be a theta.
Scope is deliberately the *matching-stem* case — an unknown slug with no
corresponding `.theta` file anywhere stays a plain prompt.

### 3. A supported check entry point

A no-model check surface that parses **and loads** a set of thetas (frontmatter
resolution, callable-set/tool admission, import graph, invoke-path resolution —
the phases short of execution) and reports the diagnostics:

- CLI: `pi theta check <dir|file>...` (or a `--theta-check` flag given the
  extension has no verb surface today), exit non-zero on any error-severity
  diagnostic;
- programmatic: a documented export equivalent, replacing ad-hoc
  `parseThetaDocument` imports.

Load-phase checks that need a live host (registry snapshot for extension tools)
degrade gracefully: absent a host, tool-admission checks report "unverifiable"
at note severity rather than passing silently.

## Alternatives considered

- **Document json mode as the only automation surface.** Cheapest; already
  half-true in practice. Rejected as the whole answer: `-p` is the documented
  invocation surface, the acceptance harness itself runs it, and the fallthrough
  hazard (motivation 2) is not fixed by documentation.
- **Always exit non-zero on top-level `Err` (no opt-in).** Changes observable
  behaviour for existing pipelines that treat `Err` as a soft outcome; the
  strict flag preserves compatibility.
- **Reserve all slash-shaped prompts (never fall through).** Breaks legitimate
  non-theta slash prompts and pi-owned commands; the matching-stem scope in §2
  avoids that.
- **A standalone lint binary in the package.** More surface to version; a CLI
  verb/flag on the existing extension reuses discovery and settings resolution.

## Specification impact

- `docs/spec_topics/slash-invocation.md`: SLSH-3/SNK gain a non-interactive
  stderr delivery clause; strict-mode exit-code contract added.
- `docs/reference/discovery-cli.md`: the check verb/flag, the strict setting,
  and the matching-stem refusal rule.
- `docs/reference/diagnostics.md`: no new codes required; the serialised content
  line format is reused for the stderr mirror.
- Tests: a provider-free `-p` fixture asserting stderr mirroring and exit codes
  (the bug-0002 real-spawn test provides the harness shape).

## Prior art in this repository

- PIC-64 rung 3 rationale (the "looks like it worked" hazard, stated for load
  refusal) — `docs/spec_topics/pi-integration-contract/subagent.md`.
- Serialised diagnostic line format — `docs/reference/diagnostics.md`.
- SNK templates — `docs/reference/discovery-cli.md` §SLSH-4.
- The envelope/stdout discipline this must not disturb — PIC-59.
