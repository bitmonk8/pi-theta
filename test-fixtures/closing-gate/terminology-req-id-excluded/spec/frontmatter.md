# Frontmatter (fixture spec page)

The FRNT prefix anchors BOTH a real runtime obligation (FRNT-1) and a
terminology-only obligation (FRNT-2), so a per-PREFIX exclusion would wrongly
drop the runtime FRNT-1. The gate's per-ID NON_EXECUTABLE_REQ_IDS carve-out
drops only FRNT-2.

<a id="frnt-1"></a> **FRNT-1.** The loader MUST reject a malformed frontmatter block. (runtime obligation)

<a id="frnt-2"></a> **FRNT-2.** *Callable-set terminology.* Authors and implementers MUST use the term `callable set` for the per-loom resolved tool list. The rule is purely terminology — no runtime behaviour changes.
