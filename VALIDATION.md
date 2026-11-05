# Validation — 5 November 2026

Environment: macOS arm64, Android Emulator 36.5.11, Resizable AVD, VS Code 1.144.1.

## Passed

- TypeScript checking, extension bundling, and core tests for discovery parsing, resolution selection, coordinate clamping, and bounded frame delivery.
- Headless Chrome: real PNG decoding, malformed-frame recovery, native coordinate mapping, wheel gestures, release on blur, canvas resize, and connection reset.
- Live emulator: attachment, portrait/landscape rotation, FOLDABLE (2208×1840), TABLET (1920×1200), PHONE (1080×2400), multi-touch RPC acceptance, transport stop/start. Original mode and physical rotation restored.
- Isolated VS Code host: activation, actual sidebar rendering, sustained Settings scrolling, hide/resume, forced refresh, automatic reconnect after a simulated port/token change, authentication failure and recovery.
- Approved dependency audit: zero vulnerabilities after updating the packaging tool's minimatch dependency via an override.
- Packaged VSIX smoke check: unpacked outside the project, launched in an isolated VS Code host, and verified activation, protocol loading, and real emulator-frame rendering without the project's node_modules.
- Repository cleanup: core tests, VSIX packaging, and browser checks passed after replacing captured/generated image dependencies with a tracked neutral fixture. The live VS Code integration rerun could not attach because no emulator was running; the successful integration results above are from the earlier implementation run. Reconnect fixtures no longer require a prior live-emulator screenshot capture.

## Performance

The real VS Code webview drew approximately 59–60 FPS in steady active-scrolling samples at 470×1044 streamed resolution. Decode averaged approximately 2.5–3.6 ms in the final run, and receipt-to-draw age approximately 3.1–4.3 ms. Startup and idle samples were lower because frames are change-driven. The integration check requires multiple active samples and a mean of at least 55 FPS across those samples.

Raw diagnostics are saved in `artifacts/extension-validation.json`; the browser preview is `artifacts/sidebar-preview.png`. The HUD's frame age excludes time before the extension receives a frame.

## Still needs manual validation

- Linux and Windows emulator discovery and adb locations.
- Actual emulator process restart, host sleep/wake, and extended all-day use.
- Multiple real emulators and device switching.
- Visual touch-target accuracy in each resized/rotated mode. Tests verify native dimensions and coordinate calculations, not every Android application's hit targets.
- Multi-touch gesture semantics such as pinch: the live test verifies RPC acceptance and release; no pinch gesture UI is supplied.

The installable artifact is a local development VSIX, not a Marketplace release.
