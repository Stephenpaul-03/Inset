# Portal Emulator

View and control an **already-running Android emulator** inside a compact VS Code sidebar or editor tab. Start the emulator from Android Studio, then attach Portal. Resizable AVDs are supported.

## Install and use

1. In VS Code, run **Extensions: Install from VSIX…** and select `artifacts/portal-emulator-0.2.1.vsix`.
2. Start your Android emulator in Android Studio.
3. Run **Portal: Open Emulator**, or click the Portal icon in the Activity Bar.
4. Choose a running emulator. Click to tap, drag to swipe, and use the wheel or trackpad to scroll.

The top toolbar contains the device picker, connection indicator, Rotate, Refresh, Open in Editor, Inspect, and More actions. Device serials appear in the picker tooltip instead of taking a separate row. Back, Home, and Recents use compact icon buttons below the display.

Use **Open in Editor** in the toolbar or **Portal: Open Emulator in Editor** from the Command Palette to open a movable editor tab beside your code. Repeated opens reuse that tab. Only one surface receives frames and input; the sidebar shows a **Move to Sidebar** action while the editor owns the session. Moving back or closing the editor returns to a visible sidebar using the same emulator connection. If neither presentation is visible, streaming pauses.

Editor mode adds **Fit**, **50%**, **100%**, **150%**, and **200%** display scales. Fit preserves the entire display and its aspect ratio. At larger scales, use the display scrollbars to pan; taps and drags still map to native device coordinates. At 100%, a device pixel occupies one display pixel. Zoom changes display size, while the streaming resolution cap remains in place.

Click the compact FPS indicator, or choose **More actions → Performance details**, to expand the detailed readout. Settings are also under More actions. To keep the sidebar beside your editor on the right, right-click its view title and use **Move View** to place it in the Secondary Side Bar.

Click the emulator screen to focus **hardware keyboard input**, then type into the Android field. Backspace/Delete, arrows, Enter, Tab, and Shift selection are forwarded. Ctrl shortcuts and the usual macOS Cmd+A/C/X shortcuts target Android while its screen has keyboard focus; other Cmd shortcuts remain available to VS Code. Paste imports plain text from the host clipboard; committed non-ASCII input and larger text blocks use Android's clipboard. Copy/cut operate on Android's clipboard. Held modifiers are released on blur, hiding, switching presentations and disconnect. Clicking Portal's toolbar returns keyboard focus to VS Code controls.

Drag input uses raw pointer updates when available and a timer capped at 120 move updates/second, independently of webview animation callbacks. Performance details show **source** (frames received from the emulator in the displayed reporting interval), **input** (pointer events sent), **browser** (animation callbacks during interaction), and **gap** (longest observed interval between drawn frames within that sample). Source briefly shows “…” while its matching host report arrives. A fast draw time with a low source rate points upstream of canvas drawing; compare input/browser rates and the same app's native behavior rather than treating every low source rate as a frame-transfer problem. Pauses and static screens reduce FPS and can increase gaps; measure during steady movement. Idle apps do not generate 60 new frames per second.

Requires VS Code 1.95 or later and a recent Android Emulator advertising local gRPC. Verified on macOS with emulator 36.5.11 and VS Code 1.144.1. adb is required for navigation buttons and live device tracking. Rotation changes the emulator's physical orientation; Android applications that lock orientation may keep their layout.

## React Native inspector inside VS Code

Start your app's local Metro server and open its **development build** in the emulator. Run **Portal: Open React Native Inspector** to open a reusable VS Code editor tab. Portal connects automatically when Metro advertises one supported runtime; choose an app when several are running. Configure **Portal: Metro URL** for a different local port.

- **Pick** in the inspector, **Portal: Pick React Native Component**, or the emulator toolbar's Inspect button enables React Native's native selection overlay. Click the emulator inside Portal to select its component. Picking intercepts that tap instead of activating the underlying application button. Click Pick again to cancel.
- Search and browse the live component tree. Selecting a row highlights its native view, displays its ancestors, and reads props, hooks, class state and context. Nested dehydrated values can be expanded on demand. Arrow keys navigate the tree.
- **Layout & styles** shows resolved native styles and dimensions when the selected component exposes a measurable native instance. Select a View/Text child if a composite component has no native layout.
- **Edit** accepts JSON values for editable props, class state, and stateful hooks. Native styles can be changed with their Edit buttons or **Apply style**. These are temporary runtime overrides; change the source file to keep them. Editing is enabled according to runtime capabilities. Context and non-stateful hooks are read-only.
- **Open source** resolves component locations through React/Hermes metadata and Metro source maps, then opens the matching workspace file in VS Code. If exact source is unavailable, Portal opens a component-name search. Navigation is limited to real files inside the open workspace roots, including symlink checks.
- **Reload app** reloads the development runtime and rebuilds the inspector tree. Closing or disconnecting the inspector stops picking and releases its debugger session. An app/socket loss triggers reconnection to the same app/device. Metro and application changes do not recreate Portal's emulator stream.

The inspector uses the app's existing React Native DevTools bridge over CDP; it does not install code into the app or require an external inspector window. The initial adapter targets **Hermes development builds exposing the Fusebox dispatcher and React DevTools bridge version 2**, introduced in modern React Native. Tally's React Native **0.81.5 / React 19.1 / Expo 54** is the live validation target. Other versions exposing that protocol are candidates, not a tested compatibility guarantee. Older standalone DevTools sockets, production/release builds, JavaScriptCore, and full React profiling are not supported by this adapter. Another DevTools/debugger can take over the same runtime; close it and reconnect Portal if needed. Runtime inspection requires a trusted VS Code workspace. Metro must be on localhost; LAN/tunnel endpoints are not accepted.

The emulator can remain in the sidebar or editor while the inspector is open. Opening inspection from an emulator editor creates the inspector beside it so the screen remains available for picking.

## Settings

| Setting | Purpose |
| --- | --- |
| `portal.adbPath` | Absolute path to adb; overrides SDK Path. |
| `portal.sdkPath` | Android SDK directory. Otherwise uses environment variables, common SDK locations, or adb on PATH. |
| `portal.discoveryPath` | Directory containing the running emulator's `pid_*.ini` files. |
| `portal.streamMode` | `smooth` (default): raw RGBA over a local binary channel, capped at 0.6 megapixels. `png`: compressed frames capped at 0.4 megapixels. |
| `portal.lowBandwidth` | Use PNG and cap streaming at one third of native resolution; this may reduce FPS. |
| `portal.showPerformance` | Expand performance details by default. Off by default; compact FPS remains visible. |
| `portal.metroUrl` | Local HTTP Metro server for React Native inspection; defaults to `http://127.0.0.1:8081`. |

The default mode prioritizes 60 FPS over full Retina resolution. For a 1080×2400 phone the resolution cap is approximately 519×1153; the canvas scales it to fit the panel. Frames arrive only when the emulator screen changes, so low FPS while idle is expected. Frame age measures extension receipt to canvas draw; it excludes emulator rendering and gRPC transit. The session pauses when neither presentation is visible and rediscovers the emulator when shown. Port/token changes trigger automatic reconnection. **Portal: Refresh Connection** forces rediscovery. **Portal: Show Diagnostics** writes a credential-free snapshot to the Portal Output channel. To measure dragging, open a long scrollable list and run **Portal: Measure Scrolling Performance**. It generates ten seconds of alternating drags through the webview input path and records every one-second sample after a two-second warmup, without discarding slow samples. The integration test also stresses the raw resolution cap, independently of its window size.

If no emulator appears, check it is running and online, then refresh. If gRPC is unavailable, update Android Emulator or set Discovery Path to the directory containing its discovery files. For missing adb, configure Adb Path or SDK Path. Emulator gRPC tokens stay inside the extension host; the webview receives only frames, display dimensions, device names/serials, and status.

## Development

```sh
npm ci
npm run build
npm test
npm run test:channel
npm run test:webview
npm run test:inspector
npm run test:inspector:live
npm run test:keyboard
npm run test:emulator
npm run test:extension
npm run package
```

Press F5 to launch the extension in a development window. Browser tests use the installed Google Chrome; extension integration tests use the installed VS Code. These two launch scripts currently use macOS application paths. Live tests require a running emulator. The emulator test temporarily changes rotation/display modes and restores them. The extension test verifies session-preserving sidebar/editor moves and single-tab reuse, opens Android Settings for drag workloads in both presentations, then presses Back afterward. It uses an isolated VS Code profile and a loopback gRPC fixture to test changed ports/tokens and authentication recovery.

`test:keyboard` opens Android Settings search, validates synthetic typing/select-all/copy, Unicode paste and editing through the real emulator keyboard RPCs, clears its query and restores the prior clipboard/app. `PORTAL_PERFORMANCE_ONLY=1 npm run test:extension` records sidebar/editor dragging, source/input/browser cadence and every post-warmup sample in `artifacts/drag-investigation.json`. These checks temporarily control the emulator; avoid interacting with it during the run.

`test:inspector` uses production inspector HTML/CSP with neutral component fixtures. `test:inspector:live` requires Tally's development build and Metro: it validates real component data, source mapping, a temporary Text-prop edit (restored afterward), native picking, and app reload recovery. It stores local screenshots only under ignored `artifacts/`. Set `PORTAL_INSPECTOR_SMOKE=1` when running `test:extension` for the inspector-in-VS-Code smoke test; it checks real connection, tab reuse, native selection, preservation of the emulator session, and close cleanup. Inspector protocol/session code lives in `src/inspector/`; `media/inspector.*` is its VS Code webview. The debugger socket remains in the extension host and the webview receives structured component data.

The source is divided into emulator discovery, adb operations, a transport boundary, the shared session/presentation provider, and a canvas webview. Raw frames and pointer events use a per-view, capability-protected WebSocket bound to 127.0.0.1. The server checks the exact Origin negotiated over VS Code’s message bridge. PNG remains available for bandwidth savings; the message bridge is a fallback if the local channel cannot connect. Acknowledgments bound the queue to three frames in flight plus the newest pending frame. Touch coordinates use separately tracked native dimensions.

The full protocol in `proto/` is pinned from Android Emulator 36.5.11. Original spike scripts and captured screenshots were removed after their findings were incorporated into the extension; the benchmark summary remains in `HANDOFF.md`. Browser and reconnect tests use the neutral image in `test/fixtures/`, so they do not depend on captured emulator screens or generated artifacts.

Git tracks source, tests, configuration, the lockfile, and documentation. Dependencies (`node_modules/`), compiled output (`dist/`, `out/`), and local packages/reports (`artifacts/`, `*.vsix`) are ignored. Rebuild them with the commands above after cloning.

## Validation and remaining limits

See `VALIDATION.md` in the source folder for measured results and open checks. Linux/Windows discovery paths are implemented but unverified. An actual emulator process restart and host sleep/wake still need manual validation; port/token replacement and reconnect behavior have been tested with a protocol fixture. Multi-device switching needs a second running emulator for live validation. Physical devices, iOS, recording, and Marketplace publishing remain outside scope. Hardware keyboard input was added in v0.2.1.

This is a private development build. Portal is a working name; name availability must be checked before publishing.
