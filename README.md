# Portal Emulator

View and control an **already-running Android emulator** inside a VS Code sidebar. Start the emulator from Android Studio, then attach Portal. Resizable AVDs are supported.

## Install and use

1. In VS Code, run **Extensions: Install from VSIX…** and select `artifacts/portal-emulator-0.1.0.vsix`.
2. Start your Android emulator in Android Studio.
3. Run **Portal: Open Emulator**, or click the Portal icon in the Activity Bar.
4. Choose a running emulator. Click to tap, drag to swipe, and use the wheel or trackpad to scroll.

Back, Home, Recents, Rotate, and Refresh are available in the view. To keep it beside your editor on the right, right-click the view title and use **Move View** to place it in the Secondary Side Bar.

Requires VS Code 1.95 or later and a recent Android Emulator advertising local gRPC. Verified on macOS with emulator 36.5.11 and VS Code 1.144.1. adb is required for navigation buttons and live device tracking. Rotation changes the emulator's physical orientation; Android applications that lock orientation may keep their layout.

## Settings

| Setting | Purpose |
| --- | --- |
| `portal.adbPath` | Absolute path to adb; overrides SDK Path. |
| `portal.sdkPath` | Android SDK directory. Otherwise uses environment variables, common SDK locations, or adb on PATH. |
| `portal.discoveryPath` | Directory containing the running emulator's `pid_*.ini` files. |
| `portal.lowBandwidth` | Cap streaming at one third of native resolution. |
| `portal.showPerformance` | Show drawn FPS, PNG decode time, and frame age. |

Frames arrive only when the emulator screen changes, so low FPS while idle is expected. Frame age measures extension receipt to canvas draw; it excludes emulator rendering and gRPC transit. The sidebar pauses its connection when hidden and rediscovers the emulator when shown. Port/token changes trigger automatic reconnection. **Portal: Refresh Connection** forces rediscovery. **Portal: Show Diagnostics** writes a credential-free snapshot to the Portal Output channel.

If no emulator appears, check it is running and online, then refresh. If gRPC is unavailable, update Android Emulator or set Discovery Path to the directory containing its discovery files. For missing adb, configure Adb Path or SDK Path. Tokens stay inside the extension host; the webview receives only frames, display dimensions, device names/serials, and status.

## Development

```sh
npm ci
npm run build
npm test
npm run test:webview
npm run test:emulator
npm run test:extension
npm run package
```

Press F5 to launch the extension in a development window. Browser tests use the installed Google Chrome; extension integration tests use the installed VS Code. These two launch scripts currently use macOS application paths. Live tests require a running emulator. The emulator test temporarily changes rotation/display modes and restores them. The extension test opens Android Settings for a scroll workload and presses Back afterward. It uses an isolated VS Code profile and a loopback gRPC fixture to test changed ports/tokens and authentication recovery.

The source is divided into emulator discovery, adb operations, a transport boundary, the sidebar provider, and a canvas webview. Scaled PNGs cross the webview bridge as ArrayBuffers. Acknowledgments bound the queue to one in-flight frame plus the newest pending frame. Touch coordinates use separately tracked native dimensions.

The full protocol in `proto/` is pinned from Android Emulator 36.5.11. Original spike scripts and captured screenshots were removed after their findings were incorporated into the extension; the benchmark summary remains in `HANDOFF.md`. Browser and reconnect tests use the neutral image in `test/fixtures/`, so they do not depend on captured emulator screens or generated artifacts.

Git tracks source, tests, configuration, the lockfile, and documentation. Dependencies (`node_modules/`), compiled output (`dist/`, `out/`), and local packages/reports (`artifacts/`, `*.vsix`) are ignored. Rebuild them with the commands above after cloning.

## Validation and remaining limits

See `VALIDATION.md` in the source folder for measured results and open checks. Linux/Windows discovery paths are implemented but unverified. An actual emulator process restart and host sleep/wake still need manual validation; port/token replacement and reconnect behavior have been tested with a protocol fixture. Multi-device switching needs a second running emulator for live validation. Physical devices, iOS, keyboard text input, recording, and Marketplace publishing are outside v1.

This is a private development build. Portal is a working name; name availability must be checked before publishing.
