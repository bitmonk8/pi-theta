// V11e / V11e-T — the binder determinism seed derivation seam.
//
// This module owns the FNV-1a seed derivation of
// binder/determinism-cancellation-failure.md §Determinism: the per-loom binder
// seed is the 32-bit FNV-1a hash (offset basis `0x811c9dc5`, prime
// `0x01000193`) of the loom's bare command name (the slash-registry name
// without the leading `/`), over the UTF-8 encoding of that name (no BOM, no
// NUL terminator), masked to 32-bit unsigned. The same loom therefore derives
// the same seed value on every binder call across processes and runs — loom's
// deterministic input to the provider call, whose `temperature: 0` pin is set
// by the V9j `buildBinderCompleteCall` and carried into the provider request.
//
// Spec: binder/determinism-cancellation-failure.md §Determinism (anchor before
// the reference-vector table): FNV-1a offset basis / prime, UTF-8 input bytes,
// 32-bit unsigned output mask, and the reference vectors
// (`code-review` → 0x7ba86b63, `hello` → 0x4f9f2cab, `a` → 0xe40c292c).
//
// V11e fills in the FNV-1a algorithm (V11e-T declared this seam).

/** The 32-bit FNV-1a offset basis. */
const FNV_OFFSET_BASIS = 0x811c9dc5;

/** The 32-bit FNV-1a prime. */
const FNV_PRIME = 0x01000193;

/**
 * The UTF-8 encoder for the input-byte sequence. `TextEncoder` is a WHATWG
 * global available on Pi's runtime; it holds no cross-invocation mutable state,
 * so a module-level instance is a pure helper (not a stateful singleton) and
 * reads no ambient primitive.
 */
const UTF8 = new TextEncoder();

/**
 * Derive the deterministic per-loom binder seed from the loom's bare command
 * name via 32-bit FNV-1a (offset basis `0x811c9dc5`, prime `0x01000193`) over
 * the UTF-8 bytes of the name, masked to 32-bit unsigned.
 *
 * The multiply step uses `Math.imul` (32-bit-truncating integer multiply); the
 * final `>>> 0` masks the output to 32-bit unsigned. Per-byte intermediate
 * state is not separately masked beyond what the canonical algorithm specifies.
 */
export function deriveBinderSeed(bareCommandName: string): number {
  const bytes = UTF8.encode(bareCommandName);
  let hash = FNV_OFFSET_BASIS;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}
