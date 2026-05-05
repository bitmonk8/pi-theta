# pi-loom — Consolidated Spec Review

_Generated: 2026-05-05T19:49:46Z (revised: merges + multi→single conversion + bottom-up reorder)_
_60 source findings → 0 commit-ready findings (8 merge clusters, 22 standalone). 8 false positives dropped at consolidation; 0 persistent failures._

Findings are ordered for **bottom-up processing**: each commit fixes the *last* finding in the doc until the doc is empty. Dependencies that require a particular landing order are encoded in the doc order — `MERGE-F` (`bindings.md` BNDS / BNDR rename) sits at the bottom of the REQ-ID-appendix supersection so it lands *before* `MERGE-G` (retirement registries + V18s sub-gates), which sits above it.

---
