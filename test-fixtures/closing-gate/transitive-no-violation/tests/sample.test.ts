// Seeded no-violation test corpus for the H5d transitive-completeness arm. Cites
// every coverage-matrix-mapped REQ-ID inline and asserts the sole registry code,
// so the H5a REQ-ID / diagnostic-code arms stay green and only the H5d arm's
// pass/fail is exercised by this scenario.
//
// FOO-1: first obligation covered.
// FOO-2: second obligation covered.
// BAR-1: bar obligation covered.

export function checks(): void {
  expect(diag.code).toBe("loom/parse/foo-bad");
}
