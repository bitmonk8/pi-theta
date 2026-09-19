// Opt-in off-session complete() queue mock. Import before production modules,
// including helpers that import them, so pi-ai is mocked before it is loaded.
// Unlike scripted-off-session-mock's replyFor stub, this records call triples,
// fails on an empty queue and consumes sticky-last. Reset stays with each
// caller: some suites deliberately accumulate calls across cells.
import { vi } from "vitest";

// Hoisted so the mock factory closes over the mutable holder each caller sets.
// Each queue entry builds its reply from the recorded model/context/options.
const scripted = vi.hoisted(() => ({
  queue: [] as Array<
    (call: { model: unknown; context: unknown; options: unknown }) => unknown
  >,
  calls: [] as Array<{ model: unknown; context: unknown; options: unknown }>,
}));

// Replace only complete(); every other pi-ai export passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (model: unknown, context: unknown, options: unknown) => {
      const call = { model, context, options };
      const index = scripted.calls.length;
      scripted.calls.push(call);
      if (scripted.queue.length === 0) {
        // No silent skipping: an unscripted dispatch fails loudly.
        throw new Error(
          `scripted complete() called with an EMPTY reply queue (call #${index + 1})`,
        );
      }
      // Sticky-last consumption: over-driving stays observable as a call-count
      // assertion instead of a mid-flight harness throw.
      const factory = scripted.queue[Math.min(index, scripted.queue.length - 1)]!;
      return factory(call);
    }),
  };
});

export { scripted };
