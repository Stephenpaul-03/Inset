# Changelog

## 0.1.1

- Make raw RGBA over a protected local binary channel the default to avoid emulator PNG encoding bottlenecks.
- Route pointer input over the local channel and pipeline a bounded three-frame window.
- Cap raw resolution at 0.6 megapixels and PNG at 0.4 megapixels.
- Add source FPS diagnostics and a benchmark that exercises webview-originated dragging.
- Generate versioned VSIX filenames from the package manifest.

## 0.1.0

- Initial sidebar extension for attaching to running Android emulators.
- Adaptive PNG streaming, performance HUD, native-coordinate pointer and wheel input.
- Device selection, navigation buttons, physical rotation, refresh, settings, and reconnect handling.
- Resizable AVD geometry synchronization and pause/resume when the view is hidden.
