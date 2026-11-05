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

## Compact sidebar and editor — v0.1.2

- Browser checks use the production HTML and CSP. Passed: compact toolbar, hidden connected-status row, name-only device label, collapsible details, presentation actions, parked canvas, raw/PNG decoding, native pointer and wheel input, zoomed/scrolled hit mapping, and portrait/landscape Fit at narrow sizes. Previews: `artifacts/sidebar-preview.png`, `artifacts/editor-preview.png`, and `artifacts/editor-landscape-preview.png`.
- VS Code checks passed for a single reusable editor tab, return to sidebar on editor close, explicit Move to Sidebar, and retention of the same emulator session ID across moves. Only the selected surface receives frames/input.
- Full-cap (519×1153) drag benchmarks retained all eight samples after the fixed warmup. The complete run measured approximately **59.87 FPS in editor mode** and **59.99 FPS in sidebar mode**. Both used the local raw channel. Reports are in `artifacts/extension-validation.json` and `artifacts/performance-0.1.2.json`.
- The unpacked v0.1.2 VSIX also passed activation, raw rendering, editor reuse, and session-preserving sidebar/editor transitions without project node_modules.
- One earlier editor benchmark timed out during initialization; a subsequent complete run passed. Benchmark startup now focuses the canvas, matching the real pointer path. Normal-workspace startup, layout preferences, and long-session behavior still need user review.

## Performance — v0.1.1

The installed v0.1.0 view reproduced approximately 14 FPS at 738×1640. Direct source profiling in the current emulator session measured about 9.7 FPS for PNG at width 738, 17.1 at width 540, 24.8 at width 470, and 48.9 at width 356. Raw RGBA measured about 59.1 FPS at width 470 and 56.9 at width 738. These measurements motivated switching formats and capping raw pixel count.

The v0.1.1 VS Code integration test drives input from the webview through the production local channel, instead of calling the transport directly. It stresses the 0.6-megapixel cap (519×1153 on this phone) and retains **all eight samples after an explicit two-second warmup**. The measured mean was **60.002 FPS**, the range was **59.988–60.030 FPS**, and source FPS was 60 in every sample. Receipt-to-draw age averaged approximately 0.9 ms. Timing-window rounding can produce a count slightly above 60; this is not a claim of a higher-refresh display.

Checks also passed for local-channel capability/Origin rejection, binary packet integrity, real raw pixel decoding, raw-to-PNG pixel agreement (zero mean error on a static screen), rotation, phone/foldable/tablet modes, hide/resume, refresh, and simulated port/token replacement/authentication recovery.

Raw diagnostics are saved in `artifacts/extension-validation.json` and `artifacts/performance-0.1.1.json`; the browser preview is `artifacts/sidebar-preview.png`. Frame age excludes emulator rendering and gRPC delivery. The default mode trades some Retina sharpness for a 60 FPS target and transfers more local data than PNG. A new package must be activated in the user's regular VS Code window before its performance there is confirmed.

### Historical v0.1.0 result and test limitation

The earlier 59–60 FPS result used PNG at 470×1044, direct transport-generated input, and a filter that selected samples already above 50 FPS. It did not establish performance at the user's larger panel size or through the webview input path. That test has been replaced; the old result should not be treated as proof of normal-workspace 60 FPS.

## Still needs manual validation

- Linux and Windows emulator discovery and adb locations.
- Actual emulator process restart, host sleep/wake, and extended all-day use.
- Multiple real emulators and device switching.
- Visual touch-target accuracy in each resized/rotated mode. Tests verify native dimensions and coordinate calculations, not every Android application's hit targets.
- Multi-touch gesture semantics such as pinch: the live test verifies RPC acceptance and release; no pinch gesture UI is supplied.

The installable artifact is a local development VSIX, not a Marketplace release.
