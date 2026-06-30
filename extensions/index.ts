// Pi extension entry point — auto-discovered from
// `package.json#pi.extensions = ["./extensions"]` (per
// extension-bootstrap-and-per-loom.md §"Extension entry point").
//
// This module is a THIN DELEGATING ENTRY SHIM. It carries no rule-subject
// logic — no broad `catch`, no global / static / singleton, no ambient-primitive
// read, and no `Promise` combinator of its own — and exists only to re-export
// the `src/**` factory (H4a) as the standard `default function (pi: ExtensionAPI)`
// export. Because this file sits outside `src/**`, none of the `src/**`-scoped
// mechanical gates inspect it; its continued purity is audited at release time
// by the loom 1.0 release-time residue inspection (checklist item 8).

export { default } from "../src/extension/factory";
