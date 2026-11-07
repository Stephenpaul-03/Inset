# Development and contributions

Inset is in pre-v1 development. Read [ROADMAP.md](ROADMAP.md) before proposing larger changes. The original code remains subject to [LICENSE.md](LICENSE.md); repository preparation does not change those terms.

## Setup

Use Node.js 24 and npm. `.nvmrc` records the development/CI major version. Install from the lockfile:

```sh
npm ci
npx playwright install chromium
npm run check
```

On Linux, Playwright may also need system libraries: `npx playwright install --with-deps chromium`, as used by CI. Browser fixtures use installed Google Chrome on macOS when available, otherwise Playwright's Chromium. Set `INSET_BROWSER_PATH` to use another local Chrome/Chromium executable.

Open the repository in VS Code and press F5 for an isolated extension development window. An emulator is needed to use the emulator view, but not to run `npm run check`. Configure `inset.adbPath`, `inset.sdkPath` or `inset.discoveryPath` when automatic discovery does not match your installation. See [usage](docs/USAGE.md).

## Checks

| Command | Coverage | Needs a device or app? |
| --- | --- | --- |
| `npm run check` | Build/typecheck, core tests, local channel and both browser fixture suites | No |
| `npm run build` | TypeScript, bundled extension and third-party notices | No |
| `npm test` | Discovery, geometry, frame queue, inspector protocol/source boundaries and keyboard encoding | No |
| `npm run test:channel` | Local capability/Origin checks, binary frames and control input | No |
| `npm run test:webview` | Production emulator HTML/CSP, rendering, coordinates, gestures, focus, keyboard and diagnostics | No |
| `npm run test:inspector` | Production inspector HTML/CSP with neutral component data | No |
| `npm run test:emulator` | gRPC capture, touch, rotation and Resizable AVD modes | Running Resizable AVD |
| `npm run test:keyboard` | Real Android text input, chords, Unicode paste and editing | Running emulator with Settings search |
| `npm run test:extension` | Real VS Code activation, presentation moves, dragging, refresh and reconnect fixtures | Installed VS Code and running emulator |
| `npm run test:inspector:live` | Real component data, source maps, temporary Text override/restoration, native picking and reload | Verified development app and Metro |

Live tests temporarily control the emulator. Avoid interacting during a run. The emulator suite changes and restores rotation/display modes; the keyboard suite clears its synthetic query and restores the prior clipboard/activity. The VS Code suite uses a temporary profile and opens Settings for scroll workloads. The live inspector fixture currently targets the maintainer's Tally app (React Native 0.81.5 / Expo 54); it is not a generic compatibility test for arbitrary apps.

The VS Code integration launcher currently uses a macOS application path. Linux CI passing does not establish live Linux/Windows emulator support. Live tests, sleep/wake and long-session checks must be recorded separately in VALIDATION.md.

Optional live test modes:

```sh
INSET_PERFORMANCE_ONLY=1 npm run test:extension
INSET_INSPECTOR_SMOKE=1 npm run test:extension
INSET_INSPECTOR_PERFORMANCE=1 INSET_INSPECTOR_SMOKE=1 npm run test:extension
```

Use a long scrollable screen for performance measurements. Retain all samples after the documented warmup, including low/stalled samples. Report source/input/browser rates and frame gaps alongside FPS; do not infer sustained 60 FPS from a peak or an idle sample.

## Source layout

| Path | Responsibility |
| --- | --- |
| `src/discovery/`, `src/adb/` | Find running emulators and invoke SDK tools |
| `src/transport/` | gRPC frames, touch, keyboard and device transport boundary |
| `src/panel/` | Shared session, sidebar/editor presentation and local frame channel |
| `src/inspector/` | Metro/Hermes connection, component tree, source boundary and inspector host |
| `media/` | Emulator/inspector webviews and icon |
| `proto/` | Pinned Android Emulator controller protocol |
| `test/`, `scripts/` | Core tests, neutral fixtures, browser/live checks and build tools |

Keep emulator tokens and debugger sockets in the extension host. Webviews should receive structured data and authorized local-channel access. Keep source navigation constrained to the workspace, preserve the bounded frame queue, and release input on focus/presentation changes. Read HANDOFF.md before changing React Native reconnect behavior: replacing RN 0.81's captured DevTools agent breaks native picking.

## Changes and pull requests

Describe the user-visible problem and resulting behavior, then include the checks run and material limitations. Use the issue/PR templates. Add focused regression coverage when changing behavior, and run the checks relevant to the change. Update documentation and the changelog when needed.

Use neutral UI fixtures in screenshots and tests. Exclude real application data, copied component values, emulator discovery files, clipboard content, tokens and machine-specific reports from commits. Generated output, local VSIX files and test artifacts are ignored. Do not commit `node_modules/`, `dist/` or `out/`.

CI builds source and tests only. Packaging is an optional local check (`npm run package`); there is no release, Marketplace upload or VSIX distribution workflow before v1.
