// V8d — `CryptoIdSource` production adapter for the `IdSource` seam (PIC-20).
//
// The runtime mints each `invocationId` and each code-side `loom-direct:`
// `toolCallId` UUID body exclusively through the injected `IdSource` seam; this
// adapter is the production wiring and the SOLE direct `crypto.randomUUID` site
// in `src/**`. Both `newInvocationId()` and `newToolCallId()` delegate to
// `crypto.randomUUID()` and return its result unchanged — the canonical
// lowercase 8-4-4-4-12 hex form the §7 placeholder convention requires. Each
// delegating call carries its own same-line `// allow-ambient: crypto.randomUUID
// — IdSource` comment, which is itself the allow-list entry the H3a scan admits
// (there is no separate registry).
//
// Spec: host-interfaces-services.md PIC-20.

import type { IdSource } from "./id-source";

export class CryptoIdSource implements IdSource {
  newInvocationId(): string {
    return crypto.randomUUID(); // allow-ambient: crypto.randomUUID — IdSource
  }

  newToolCallId(): string {
    return crypto.randomUUID(); // allow-ambient: crypto.randomUUID — IdSource
  }
}
