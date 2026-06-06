# Diagnostics

Loom emits structured diagnostics through two delivery channels, both owned by the loom extension. Pi's own `LoadExtensionsResult.errors` field is **not** used: that field belongs to Pi's extension loader, and loom instead emits its own [`loom/load/extension-bootstrap-failed`](./diagnostics/code-registry-load.md) for the same class of factory-time bootstrap registration / subscription failures Pi would otherwise push into it. Such bootstrap failures surface on Pi startup; the diagnostics defined here all fire after the extension is already live (during scan, watcher reload, or slash-command execution).

## Contents

- [Diagnostic shape](./diagnostics/diagnostic-shape.md)
- [Placeholder rendering a](./diagnostics/placeholder-rendering-a.md)
- [Placeholder rendering b](./diagnostics/placeholder-rendering-b.md)
- [Code registry parse](./diagnostics/code-registry-parse.md)
- [Code registry load](./diagnostics/code-registry-load.md)
- [Code registry runtime](./diagnostics/code-registry-runtime.md)
- [Code registry host](./diagnostics/code-registry-host.md)
