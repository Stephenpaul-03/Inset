# VS Code Android Emulator Panel: v1 handoff

## Presentation update — v0.1.2, 5 November 2026

- Compact sidebar: one toolbar, connection dot, device name without repeated labels, icon navigation, compact FPS, expandable details and overflow settings.
- Editor: **Portal: Open Emulator in Editor** (or toolbar pop-out), one reusable tab, Fit/50–200% zoom, scrollbar panning, and **Move to Sidebar**. Closing the editor returns to a visible sidebar.
- Both surfaces share one transport/session. The parked surface closes its frame socket and accepts only presentation actions; transitions release held touches and invalidate queued input.
- The browser test now uses the exact production HTML generator in `src/panel/html.ts` and checks zoomed/scrolled coordinates and portrait/landscape fitting. The VS Code suite checks session IDs across moves and benchmarks dragging in both presentations.
- Local artifact: `artifacts/portal-emulator-0.1.2.vsix`, installed in the normal VS Code profile. Reload the window to activate, then review the layout and editor workflow in the normal workspace. Streaming quality limits and outstanding platform checks are unchanged.
- Final complete-run drag means: 59.87 FPS in editor mode and 59.99 FPS in sidebar mode. The unpacked VSIX passed rendering, editor reuse, and session-preserving transitions. The owner reviewed and approved the new layout.

## Performance update — v0.1.1, 5 November 2026

The installed v0.1.0 reproduced low FPS at 738×1640. Direct profiling showed a PNG capture/encoding bottleneck in the current emulator session. v0.1.1 defaults to raw RGBA over a loopback WebSocket, with a 0.6-megapixel resolution cap, input on the same channel, and a bounded three-frame window. PNG remains an optional bandwidth-saving mode. A full-resolution-cap VS Code test measured approximately 60 FPS through webview-originated dragging, retaining every sample after a fixed warmup. See VALIDATION.md. The original PNG decision below is historical and superseded by this measurement.

### Historical v0.1.1 checkpoint

- v0.1.1 is packaged at `artifacts/portal-emulator-0.1.1.vsix` and installed in the owner's normal VS Code profile. Activation required **Developer: Reload Window**; performance in that workspace has not yet been confirmed.
- Next: verify that the HUD shows `rgba · local` after activation and measure actual dragging in the normal workspace. Check image sharpness against the 0.6-megapixel cap before adjusting quality settings.
- Passed before this checkpoint: core tests, local-channel capability/Origin checks, browser rendering/input checks, live rotation/resizing, full-cap webview-originated dragging (60.002 FPS mean), reconnect/auth recovery, and unpacked VSIX raw-channel smoke validation.

## Implementation update — 5 November 2026

The extension is implemented in `src/` and `media/`. See `README.md` for installation/development and `VALIDATION.md` for measured results and remaining manual checks. The original handoff below is retained as the design and spike record; its "NOT yet verified" list describes the pre-implementation state.

- Built: sidebar canvas, adaptive PNG/ArrayBuffer streaming, bounded frame delivery, performance HUD, device picker, pointer/wheel input, navigation/rotate/refresh, path settings, reconnect, and hidden-view pause/resume.
- Verified on the owner's Mac: real VS Code rendering at approximately 59–60 FPS during steady scrolling, rotation, Resizable AVD phone/foldable/tablet modes, transport reconnect, and hide/resume. Simulated restart tests cover changed ports/tokens and authentication recovery.
- Remaining: actual process restart and sleep/wake, second real emulator/device switching, Linux/Windows, and extended daily use. Multi-touch RPCs are accepted; pinch behavior remains unverified.
- Local VSIX: `artifacts/portal-emulator-0.1.1.vsix`. This is a private development build, not a Marketplace release. Working name: Portal Emulator.
- Repository cleanup: original spike scripts, the minimal protocol, raw benchmark JSON, and captured emulator screenshots have been removed. Their findings remain below; current validation scripts are in `scripts/` and use a neutral test fixture. Build output and local artifacts are ignored by Git.

---

Working title: TBD (candidates: Porthole, Pane, SideDroid). Check Marketplace/npm for conflicts before publishing.

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
