# H3 — Diagnostics primitive and multi-error accumulator

**Spec.** [Diagnostics](../spec_topics/diagnostics.md).

**Adds.** `Diagnostic` shape from the spec; `DiagnosticsAccumulator`; serialiser to Pi's flat `{ path, error }` shape; typed code-namespace constants (`loom/parse/*`, `loom/type/*`, `loom/load/*`, `loom/runtime/*`); `MultiErrorReporter` ordering by `(file, line, column)`.

**Tests.**
- Range is 1-indexed, end-exclusive.
- Serialised line shape: `"<file>:<line>:<col>: <code>: <message>"`.
- Hint appended as `"\n  hint: <hint>"`.
- Related sites appended as indented lines.
- Multi-error sort is stable on equal positions.
- For each defined severity (`"error"`, `"warning"`), a `Diagnostic` value passed through the `DiagnosticsAccumulator` serialiser appears as `details.diagnostics[i].severity` on the resulting `loom-system-note` `pi.sendMessage` payload with the same string value (the line-format `content` string carries no severity field and is not asserted here).

**Deps.** H2.

**Ships when.** All later phases emit through `DiagnosticsSink` exclusively (lint rule forbids `throw new Error` for spec-defined diagnostics).
