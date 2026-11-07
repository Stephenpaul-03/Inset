# Validation — updated 7 November 2026

Environment: macOS arm64, Android Emulator 36.5.11, Resizable AVD, VS Code 1.144.1.

## Inset rename — v0.3.0

- Renamed the manifest, commands, configuration namespace, view IDs, inspector UI/output, icon path, package name, test fixtures and validation environment variables. The only old product-name references in current source/docs are the README's explicit transition instructions.
- Passed: nine core tests, TypeScript checking/bundling, production emulator and inspector browser fixtures, and the local binary channel integration check. The binary frame marker is unchanged; the branding update does not change the frame protocol.
- The unpacked `inset-0.3.0.vsix` passed in an isolated VS Code profile without project dependencies: activation as `local.inset`, raw emulator rendering, one reusable editor tab, and sidebar/editor moves retaining the same emulator session. The user's installed development extension was not replaced by this check.
- Previous-version measurements below remain historical. This rename is not a fresh sustained-FPS measurement or a new React Native runtime compatibility claim.

## Keyboard and drag follow-up — v0.2.1

- Nine core/protocol tests and TypeScript/bundling checks pass. Production webview checks cover focused typing, modifiers, composition committed once, paste, release on blur, and toolbar typing isolation. A delayed-rAF test verifies move delivery does not depend on compositor callbacks.
- Real Android Settings search passed synthetic typing, USB Ctrl+A/C with clipboard readback, Unicode paste, arrow navigation and Backspace. The test clears its query and restores the prior app/clipboard. The owner separately confirmed hardware keyboard input works after installing v0.2.1.
- Direct-source eight-second scrolling produced per-second frame counts `[59, 60, 45, 55, 59, 59, 60, 59]`; touch RPC time p50 0.445 ms, p95 1.563 ms, max 45.79 ms. This demonstrates intermittent upstream dips even without VS Code drawing, but does not isolate their cause.
- An isolated VS Code run measured approximately 60 FPS in all eight post-warmup samples in both sidebar and editor, with source 60, input approximately 122/s, browser approximately 120/s and draw approximately 0.1 ms. Report: `artifacts/drag-investigation.json`. This synthetic benchmark does not reproduce every physical pointer/device cadence or normal-workspace load.
- Owner's normal-workspace report before the drag fix: 27 FPS, source 24, raw/local, draw 0.1 ms, age 1 ms. After v0.2.1, their screenshot shows 59 FPS, browser 126/s, draw 0.1 ms and age 1 ms, with intermittent dips still reported. Its source 42 label was from the previous reporting interval; the follow-up matches source and displayed windows and adds the maximum observed gap between drawn frames within each sample. Frame gaps can include pauses or static content and are not automatically dropped frames.
- The owner clarified that the observed dips happen at swipe starts/ends or pauses, consistent with change-driven frame delivery and one-second averaging. No steady-motion dips have been reported after this update. Sustained normal-workspace 60 FPS remains unproven by a screenshot; investigate further if actual stutters or steady-motion dips occur. Do not discard low benchmark samples. No React Native inspector-connected performance rerun was performed in this follow-up; Metro was not running.

## Passed

- TypeScript checking, extension bundling, and core tests for discovery parsing, resolution selection, coordinate clamping, and bounded frame delivery.
- Headless Chrome: real PNG decoding, malformed-frame recovery, native coordinate mapping, wheel gestures, release on blur, canvas resize, and connection reset.
- Live emulator: attachment, portrait/landscape rotation, FOLDABLE (2208×1840), TABLET (1920×1200), PHONE (1080×2400), multi-touch RPC acceptance, transport stop/start. Original mode and physical rotation restored.
- Isolated VS Code host: activation, actual sidebar rendering, sustained Settings scrolling, hide/resume, forced refresh, automatic reconnect after a simulated port/token change, authentication failure and recovery.
- Approved dependency audit: zero vulnerabilities after updating the packaging tool's minimatch dependency via an override.
- Packaged VSIX smoke check: unpacked outside the project, launched in an isolated VS Code host, and verified activation, protocol loading, and real emulator-frame rendering without the project's node_modules.
- Repository cleanup: core tests, VSIX packaging, and browser checks passed after replacing captured/generated image dependencies with a tracked neutral fixture. The live VS Code integration rerun could not attach because no emulator was running; the successful integration results above are from the earlier implementation run. Reconnect fixtures no longer require a prior live-emulator screenshot capture.

## React Native inspector — v0.2.0

- Seven core/protocol tests passed, including Unicode tree operations, atomic rejection of unsupported/truncated operations, local-only Metro configuration, and source navigation constrained to workspace roots (including symlinks).
- Production inspector HTML/CSP passed browser checks for tree/filtering, app values rendered as text, JSON validation, edit messages, nested hydration, source action, and narrow layout. Existing emulator browser rendering/input/zoom checks also passed after the toolbar addition.
- Live Tally: React Native 0.81.5, React 19.1, Expo 54, Hermes, DevTools backend `6.1.5-5d87cd2244` / bridge v2. Passed real component selection/props/hooks, source mapping to `Tally/App.tsx`, temporary Text-prop change and restoration, native overlay picking, and app reload recovery. The final reload rebuilt an 862-node tree; normal steady-state snapshots were around 892 nodes. No application source files or persistent data were modified.
- Isolated VS Code passed real connection, one editor-tab reuse, native selection, unchanged emulator session ID, close cleanup, and native picking after close/reopen. The same checks passed against the unpacked VSIX outside project dependencies. Log: `artifacts/inspector-packaged-vscode.log`.
- RN 0.81 compatibility finding: replacing the runtime's DevTools agent leaves AppContainer's native picker using its captured old agent. Inset reuses the existing domain/agent on reconnect and uses a bridge filter update to rebuild the tree. Closing stops native selection/highlights and closes CDP while preserving the built-in runtime agent.
- **The inspector-connected sustained-60-FPS check did not pass.** One Settings drag run averaged 30.73 FPS. A separate emulator-only baseline produced four approximately 60-FPS samples, then stalled at source FPS zero; a subsequent inspector check lost its runtime target before benchmarking. The original AVD/Metro processes exited during this work; functional checks completed after restarting the same AVD headlessly. These results do not isolate inspector overhead and do not establish sustained 60 FPS for v0.2.0. Repeat in the normal foreground VS Code/emulator setup; do not filter out stalled/low samples. `INSET_INSPECTOR_PERFORMANCE=1 INSET_INSPECTOR_SMOKE=1 npm run test:extension` retains the optional >=55-FPS regression check.
- Other React Native/Expo versions, older standalone sockets, JavaScriptCore, release builds, remote Metro, and full profiling are not validated/supported by the initial adapter. Runtime disconnects rediscover only the previously selected app/device; multi-app and prolonged restart coverage still need broader testing.

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
