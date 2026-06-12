# `V11e` — Binder system-note rendering and determinism

**Spec.** [`../spec_topics/binder/defaulting-system-note-echo.md`](../spec_topics/binder/defaulting-system-note-echo.md), [`../spec_topics/binder/determinism-cancellation-failure.md`](../spec_topics/binder/determinism-cancellation-failure.md).

**Adds.** The binder system-note rendering (single-line, 120-codepoint cap at scalar boundaries with `…`, the five note rules) and the binder determinism contract (`temperature:0`, the FNV-1a seed derivation, fixed messages).

**Tests.**
- [defaulting-system-note-echo.md — System-note rendering rule 1 (single-line collapse/trim)](../spec_topics/binder/defaulting-system-note-echo.md#system-note-rendering) (BNDR area): the system-note renders single-line against the section's normative reference rendering — a `needs_info` `message` of `binding\tfailed   here` collapses the tab-plus-spaces run to one U+0020 (`loom /<name>: argument binding needs more info — binding failed here`), while `a\u00A0b` is preserved unchanged because U+00A0 lies outside the rule-1 ASCII-whitespace set.
- [defaulting-system-note-echo.md — System-note rendering rule 2 (120-code-point cap)](../spec_topics/binder/defaulting-system-note-echo.md#system-note-rendering) (BNDR area): a rendered note exceeding 120 code points truncates at a Unicode scalar boundary with a trailing `…` to exactly 120 code points (the `…` counts toward the cap); a note ≤120 code points gets no `…`.
- [defaulting-system-note-echo.md — System-note rendering rule 3 (prefix/suffix demarcation)](../spec_topics/binder/defaulting-system-note-echo.md#system-note-rendering) (BNDR area): a failure-arm note matches the grammar `loom /<name>: <fixed-phrase> — <sanitised-suffix>` and the success echo matches `Running /<name>: <formatted-args>`, with the em-dash (failure) and `:` (echo) marking the loom-controlled-prefix↔model-or-runtime-controlled-suffix boundary.
- [defaulting-system-note-echo.md — System-note rendering rule 4 (empty model content → malformed envelope)](../spec_topics/binder/defaulting-system-note-echo.md#system-note-rendering) (BNDR area): a `message` (or a `candidates` array whose every entry is) empty after rule-1 stripping is classified as a malformed envelope and routed to the malformed-envelope failure row, not surfaced as an empty note; the malformed-envelope row template itself is asserted by `V11f`.
- [defaulting-system-note-echo.md — System-note rendering rule 5 (`ambiguous.candidates` not surfaced)](../spec_topics/binder/defaulting-system-note-echo.md#system-note-rendering) (BNDR area): the `ambiguous` failure row renders only the model's `message` and never surfaces `candidates` in loom 1.0; the envelope-schema retention of `candidates` is asserted by `V11c`'s `BNDR-2`.
- [determinism-cancellation-failure.md — binder determinism](../spec_topics/binder/determinism-cancellation-failure.md) (BNDR area): the binder seed is derived via FNV-1a so the same inputs produce the same seed; `temperature:0` is set on every call.

**Deps.** `V11e-T`, `V11h`, `V9j`

**Ships when.** `npm test` asserts each of the five System-note-rendering rules (single-line collapse against the reference rendering, the 120-code-point cap, the prefix/suffix grammar, empty-content→malformed-envelope classification, and `ambiguous.candidates` non-surfacing) and the deterministic FNV-1a seed.
