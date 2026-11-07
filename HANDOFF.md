# Inset: project handoff

## GitHub preparation — 7 November 2026

- Prepared a development repository, with distribution deferred until v1. The root README is the project overview; detailed controls/settings are in `docs/USAGE.md`. Added CONTRIBUTING.md, ROADMAP.md, SECURITY.md, repository setup notes, issue/PR templates, weekly Dependabot configuration, Node 24 guidance and a source/browser CI workflow. The original license restriction is unchanged.
- `npm run check` builds/typechecks and runs core, local-channel and both production browser fixture suites without a device. CI uses pinned official actions, read-only contents permissions, a lockfile install and Playwright Chromium on Linux. Browser launch supports `INSET_BROWSER_PATH`, installed macOS Chrome and Playwright's default browser.
- No packaging, release upload or Marketplace workflow is present. The destination GitHub repository is being created by the owner. Add the confirmed remote and repository metadata after its URL is provided; no owner/URL is invented here.
- A fresh temporary source copy passed `npm ci --offline` and `npm run check`. Both browser suites additionally passed with Playwright's downloaded Chromium headless shell. The lockfile and regenerated notices remained unchanged, YAML parsed, and relative Markdown links resolved. This is local validation; the hosted workflow must still pass after the first push.

## Inset rename — v0.3.0, 7 November 2026

- Current product name: **Inset**. Package/extension: `inset` / `local.inset`. Commands, configuration, views, output channel, inspector messages, asset references and test scripts use the new name. Validation environment variables use `INSET_*`.
- Current package: `artifacts/inset-0.3.0.vsix`. It has a new extension identity; disable/uninstall the old development extension before enabling it, rename custom settings/keybindings, and select the device/layout again. See README.md for the transition.
- Historical results below predate this rename. Pre-rename VSIX files retain their original filenames locally; historical validation results are not new v0.3.0 measurements.
- The repository's current on-disk directory is unchanged. Commands and scripts resolve from the repository root and do not depend on its directory name.
- Passed: core/browser/channel checks and an unpacked-VSIX smoke test in isolated VS Code (activation, raw rendering, editor reuse and session-preserving view transitions). The renamed package has not replaced the owner's installed development extension. No Git remote is configured yet.

## Keyboard and drag follow-up — v0.2.1, 6 November 2026

- Added focused hardware keyboard input through the existing local channel: printable typing, editing/navigation keys, modifier chords, IME composition and plain-text paste. USB HID key encoding and 16 ms event spacing were required for reliable real-emulator modifier transitions. Unicode/long text uses the guest clipboard. Focus loss and presentation changes cancel queued typing and release held modifiers; toolbar inputs remain local to VS Code.
- Drag moves now use raw pointer updates where available and a timer capped at 120 Hz, independently of webview animation callbacks. Browser regression coverage deliberately delays rAF and verifies that dragging still sends moves.
- The owner confirmed hardware keyboard input works in the normal VS Code window. Their latest screenshot shows 59 FPS, browser 126 callbacks/s, draw 0.1 ms and frame age 1 ms, but they still report occasional FPS dips. Sustained normal-workspace 60 FPS is **not established**. Earlier direct-source samples included 45 and 55 FPS among near-60 samples; isolated VS Code sidebar/editor runs reached 60 throughout their post-warmup samples. These do not prove the remaining intermittent dips are fixed.
- Performance details include source/input/browser rates. A follow-up fixes the source label's previous-interval lag by matching reporting windows and adds the longest observed gap between frames in the sample. Pauses/static screens reduce frame and input counts; inspect dips during steady motion. The source counter measures frames received by the extension, not the Android app's internal render rate; frame age excludes emulator rendering/gRPC transit.
- Validation commands: `npm run test:keyboard` temporarily opens Settings search and restores the previous clipboard/app; `INSET_PERFORMANCE_ONLY=1 npm run test:extension` records sidebar/editor scrolling without filtering low post-warmup samples. Avoid interacting with the emulator during those live checks. See VALIDATION.md for results. Local artifact: the pre-rename v0.2.1 VSIX.
- The owner clarified that dips occur at swipe starts/ends or pauses, consistent with fewer changed frames in those reporting windows. They have not reported steady-motion dips after this update and approved committing the keyboard/performance changes on 7 November 2026. Do not present the 59-FPS screenshot as proof of sustained 60 FPS; investigate matching source/input/browser/gap readings if actual motion stutters or steady-motion dips are reported.

## React Native inspection — v0.2.0, 5 November 2026

- Added a React Native inspector **inside VS Code**: reusable editor tab, emulator-toolbar Inspect, native picking/highlighting, searchable component tree/ancestors, props/hooks/state/context, nested hydration, native styles/layout, capability-aware JSON runtime edits, and workspace source navigation through React/Hermes + Metro source maps.
- Runtime connection: `src/inspector/{CdpClient,discovery,InspectorSession,ComponentTree}.ts`; VS Code host/source boundary: `InspectorPanel.ts`, `source.ts`; production markup/assets: `src/inspector/html.ts`, `media/inspector.{js,css}`. No app files/dependencies were changed for inspection.
- Commands: **Inset: Open React Native Inspector**, **Inset: Pick React Native Component**. `inset.metroUrl` defaults to `http://127.0.0.1:8081`. The inspector requires workspace trust, local Metro, and a Hermes development build with the Fusebox dispatcher/DevTools bridge v2. Tally (RN 0.81.5, React 19.1, Expo 54) is the verified target; older standalone sockets, release builds, JavaScriptCore and full profiling are outside this adapter. Other RN versions still need validation.
- RN 0.81 reconnect detail: AppContainer captures the first native overlay agent at mount. Replacing/shutting down that agent breaks native picking after reconnect. Inset reuses an existing dispatcher domain/agent and requests a fresh tree through the bridge's default host-component filter update; on close it stops picking/highlighting and closes CDP, leaving the app's built-in backend intact. Reloads rebuild the tree and discard stale selection requests.
- Passed: seven core/protocol/source-boundary tests, production inspector browser checks, existing emulator browser checks, real Tally tree/props/hooks, `App.tsx` source mapping, temporary Text edit/restoration, native picking and reload recovery. The unpacked VSIX passed inside isolated VS Code: real app connection (~892 nodes), one-tab reuse, native selection, close/reopen picking, close cleanup and unchanged emulator session ID.
- Artifacts: the pre-rename v0.2.0 VSIX, `inspector-live.png`, `inspector-preview.png`, `inspector-packaged-vscode.log`. Build output and screenshots remain ignored.
- v0.2.0 was installed successfully in the owner's normal VS Code profile. The owner confirmed that the inspector works and approved committing it. Run **Inset: Open React Native Inspector** with the development app and Metro running.
- During validation, the original emulator/Metro processes exited; the same Resizable AVD was restarted headlessly and Tally's local Metro server restarted. No emulator data was erased.
- Performance follow-up remains open: an inspector-connected drag run averaged 30.73 FPS; a separate baseline started near 60 FPS and then stalled at source FPS zero. A repeat lost the Metro target before measuring. Functional tests and packaged inspection pass, but sustained-60-FPS validation for v0.2.0 is not established. Details/commands are in VALIDATION.md.


## Presentation update — v0.1.2, 5 November 2026

- Compact sidebar: one toolbar, connection dot, device name without repeated labels, icon navigation, compact FPS, expandable details and overflow settings.
- Editor: **Inset: Open Emulator in Editor** (or toolbar pop-out), one reusable tab, Fit/50–200% zoom, scrollbar panning, and **Move to Sidebar**. Closing the editor returns to a visible sidebar.
- Both surfaces share one transport/session. The parked surface closes its frame socket and accepts only presentation actions; transitions release held touches and invalidate queued input.
- The browser test now uses the exact production HTML generator in `src/panel/html.ts` and checks zoomed/scrolled coordinates and portrait/landscape fitting. The VS Code suite checks session IDs across moves and benchmarks dragging in both presentations.
- Local artifact: the pre-rename v0.1.2 VSIX, installed in the normal VS Code profile. Reload the window to activate, then review the layout and editor workflow in the normal workspace. Streaming quality limits and outstanding platform checks are unchanged.
- Final complete-run drag means: 59.87 FPS in editor mode and 59.99 FPS in sidebar mode. The unpacked VSIX passed rendering, editor reuse, and session-preserving transitions. The owner reviewed and approved the new layout.

## Performance update — v0.1.1, 5 November 2026

The installed v0.1.0 reproduced low FPS at 738×1640. Direct profiling showed a PNG capture/encoding bottleneck in the current emulator session. v0.1.1 defaults to raw RGBA over a loopback WebSocket, with a 0.6-megapixel resolution cap, input on the same channel, and a bounded three-frame window. PNG remains an optional bandwidth-saving mode. A full-resolution-cap VS Code test measured approximately 60 FPS through webview-originated dragging, retaining every sample after a fixed warmup. See VALIDATION.md. The original PNG decision below is historical and superseded by this measurement.

### Historical v0.1.1 checkpoint

- v0.1.1 is packaged at the pre-rename v0.1.1 VSIX and installed in the owner's normal VS Code profile. Activation required **Developer: Reload Window**; performance in that workspace has not yet been confirmed.
- Next: verify that the HUD shows `rgba · local` after activation and measure actual dragging in the normal workspace. Check image sharpness against the 0.6-megapixel cap before adjusting quality settings.
- Passed before this checkpoint: core tests, local-channel capability/Origin checks, browser rendering/input checks, live rotation/resizing, full-cap webview-originated dragging (60.002 FPS mean), reconnect/auth recovery, and unpacked VSIX raw-channel smoke validation.

## Implementation update — 5 November 2026

The extension is implemented in `src/` and `media/`. See `README.md` for installation/development and `VALIDATION.md` for measured results and remaining manual checks. The original handoff below is retained as the design and spike record; its "NOT yet verified" list describes the pre-implementation state.

- Built: sidebar canvas, adaptive PNG/ArrayBuffer streaming, bounded frame delivery, performance HUD, device picker, pointer/wheel input, navigation/rotate/refresh, path settings, reconnect, and hidden-view pause/resume.
- Verified on the owner's Mac: real VS Code rendering at approximately 59–60 FPS during steady scrolling, rotation, Resizable AVD phone/foldable/tablet modes, transport reconnect, and hide/resume. Simulated restart tests cover changed ports/tokens and authentication recovery.
- Remaining: actual process restart and sleep/wake, second real emulator/device switching, Linux/Windows, and extended daily use. Multi-touch RPCs are accepted; pinch behavior remains unverified.
- Local VSIX: the pre-rename v0.1.1 VSIX. This is a private development build, not a Marketplace release. Working name: Inset.
- Repository cleanup: original spike scripts, the minimal protocol, raw benchmark JSON, and captured emulator screenshots have been removed. Their findings remain below; current validation scripts are in `scripts/` and use a neutral test fixture. Build output and local artifacts are ignored by Git.

---

Product name: Inset. Marketplace/npm availability still needs checking before publishing.

## Goal
A VS Code extension that shows and controls an **already-running** Android emulator (started from Android Studio, resizable AVD included) inside the sidebar. No second emulator, no extra window. Expo / React Native workflow is the main use case. Emulators only for now; physical phones are out of scope.

Why not Radon IDE: it manages its own emulator instances and a short list of device types, so it cannot attach to a running Resizable AVD. Do NOT copy Radon code (its license does not cover current versions). This is a clean build.

## What v0 proved (verified on the owner's Mac, emulator 36.5.11)
- A running emulator started from Android Studio advertises gRPC in a discovery file: `~/Library/Caches/TemporaryItems/avd/running/pid_<pid>.ini` with keys `port.serial`, `avd.name`, `grpc.port`, `grpc.token`.
- Plaintext gRPC on `127.0.0.1:<grpc.port>` with metadata `authorization: Bearer <grpc.token>` works.
- `getStatus`, `getScreenshot`, `streamScreenshot` and `sendTouch` all work against the running emulator.
- Taps/swipes via `sendTouch` change the screen and the stream delivers new frames.
- Frame size equals `adb shell wm size` (1080x2400); touch coordinates are in that native pixel space.
- Frames are pushed only when the screen changes.
- Full-res PNG frames are heavy (about 570 KB avg, up to 1.8 MB).

## NOT yet verified (test early)
1. Rotation and Resizable AVD size changes (phone/foldable/tablet): does the frame size change cleanly, and does `sendTouch` mapping stay correct?
2. Multi-touch (second `identifier`), and the 4 MB gRPC default limit (already lifted in `lib.js`; needed for raw frames).
3. Behavior when the emulator restarts or sleeps (token and port change on restart).
4. Which frame format/size to request (see Benchmark below).
5. Whether the webview keeps streaming when the sidebar is hidden (use `retainContextWhenHidden` or pause/resume).
6. Other OSes: discovery dirs for Linux/Windows are guesses.

## Historical reference code
The original `lib.js`, `spike.js`, `bench.js`, `fling.js`, and `emulator_min.proto` were exploratory tools and have been retired. Their discovery, connection, and input logic now lives in `src/`; the full pinned controller protocol is in `proto/`. Benchmark findings below are retained as the decision record.

## Architecture
```
src/
  extension.ts            activate, register WebviewViewProvider, commands
  panel/EmulatorView.ts   webview provider; owns message protocol
  transport/
    DeviceTransport.ts    interface (below)
    EmulatorGrpcTransport.ts
  adb/adb.ts              locate adb, list devices (adb track-devices), keyevents
  discovery/running.ts    parse pid_*.ini -> {serial,name,grpcPort,token}
media/webview.js          canvas drawing, pointer events -> coordinates
```
Bundle with esbuild. TypeScript. Dependencies: `@grpc/grpc-js`, `@grpc/proto-loader`.

```ts
interface DeviceTransport {
  start(target: EmulatorTarget): Promise<void>;
  onFrame(cb: (f: { width: number; height: number; data: Uint8Array; format: 'png' | 'rgba' | 'rgb888' }) => void): void;
  onSizeChange(cb: (w: number, h: number) => void): void;
  touch(points: { x: number; y: number; id: number; down: boolean }[]): void; // native px
  stop(): void;
}
```
Keep this boundary clean: a scrcpy transport (physical devices) may be added later.

### Webview messages (extension <-> webview)
- ext -> web: `frame {width,height,format,bytes}`, `devices [{serial,name}]`, `status {state,message}`
- web -> ext: `pointer {type:'down'|'move'|'up', x, y}` (already mapped to native px), `button {name:'back'|'home'|'recents'|'rotate'|'refresh'}`, `selectDevice {serial}`

Transfer frames to the webview as ArrayBuffer/typed arrays, not base64, if the benchmark shows volume is an issue.

## v1 scope (done when: code all day with the Expo app on the right, never touching the emulator window)
- Sidebar webview with `<canvas>`, scaled to panel width, aspect ratio preserved
- Device picker listing running emulators, live updates
- Streaming with the format/size chosen from the benchmark; drop frames if the webview falls behind
- Pointer input: tap, drag, scroll (wheel -> swipe) mapped to native px
- Buttons: Back, Home, Recents (`adb shell input keyevent 4/3/187`), Rotate, Refresh
- Handle size/rotation changes by reading size from frames, never hardcode
- Clear errors: adb not found, no emulator running, emulator lacks gRPC, auth failure, reconnect on restart
- Settings: SDK/adb path override

## Non-goals for v1
iOS simulator, physical devices/scrcpy, keyboard text input, screen recording, debugging features (Radon does those), Marketplace publishing.

## Benchmark decision (measured on the owner's Mac, Resizable AVD 1080x2400, 8s scroll workload)
```
config      size      KB/frame act fps MB/s   lat p50 lat p95 gap p95 cpu%
png-full    1080x2400 713      17.8    12.4   134     154     421     6
png-half    540x1200  262      43.0    11.2   92      122     28      6
png-third   356x791   148      45.3    6.7    80      93      36      5
rgba-half   540x1200  2531     46.4    114.6  71      77      35      18
rgba-third  356x791   1100     46.1    49.5   71      79      36      12
rgb888-half 540x1200  1898     45.6    84.5   73      78      36      16
```
Findings:
- bench.js showed ~43-46 fps for everything except png-full (~18 fps, big PNG encode). That plateau came from the workload (touch events sent ~45/s drive redraws), NOT from the stream.
- fling.js (self-animating fling, no touch-rate limit) measured frame spacing while the list animates: gap p50 = 16.4-16.8 ms in ALL configs (png-half, png-third, rgb888-third, rgba-third) = 60 Hz cadence. p95 = 18-24 ms (png-half 24, the others 18-21), so only occasional drops. Ignore its "peak fps" column: each fling animated only ~0.3 s (16-18 frames), which caps any 1-second window.
- CONCLUSION: the gRPC stream can deliver ~60 fps. Target 60 fps.
- Raw formats shave ~10-20 ms latency but move 50-115 MB/s. Not worth it unless webview transfer proves cheap.
- cpu% is only the Node receive side. Webview decode/draw and extension-host -> webview transfer are NOT measured; measure them in the extension.

**Decision: PNG, scaled, requested size chosen adaptively.**
- Default request width = min(native width, panel CSS width x devicePixelRatio), height from the native aspect ratio. On a retina Mac with a ~350px panel that lands near png-half (540 wide, ~262 KB/frame, ~43 fps).
- Never request full native size by default (png-full is the only config that stutters).
- Offer a "low bandwidth" setting that uses ~1/3 scale (png-third).
- Decode in the webview with `createImageBitmap(new Blob([bytes]))` and draw to canvas; drop stale frames if decoding falls behind (only render the newest).
- Re-request the stream with a new width when the panel is resized (debounced), and when the emulator size/rotation changes.
- Touch coordinates stay in NATIVE pixels regardless of the requested frame size.
- FIRST MILESTONE (throwaway HUD): stream one frame source into the webview canvas with an on-screen readout of (a) frames drawn per second, (b) createImageBitmap decode ms, (c) frame age (arrival minus draw). Acceptance: while scrolling a long list, drawn fps >= ~55 at the adaptive size. If not, apply the contingency below before building features.
- Contingency: if extension-host -> webview `postMessage` becomes the bottleneck, try a local WebSocket/HTTP channel for frame bytes; raw RGBA stays off the table unless that proves cheap.
Run with a scrollable screen open (Settings or the Expo app with a long list). `cpu%` measures only the Node-side receive cost; webview decode/draw cost must be measured inside the extension.

## Risks
| Risk | Mitigation |
|---|---|
| gRPC API is experimental | Pin a known-good proto; test on new emulator versions |
| Frame volume | Scaled frames, raw vs PNG per benchmark, frame dropping |
| Token/port change on emulator restart | Re-run discovery on connection loss |
| Resizable AVD edge cases | Test rotation + size switching first (unverified item 1) |
