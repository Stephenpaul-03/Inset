# Changelog

## Unreleased

- Prepare the GitHub repository with source/browser CI, dependency update configuration, issue/PR templates and maintainer setup notes.
- Add contribution, security and v1 roadmap guides; separate the repository overview from detailed usage documentation.
- Make browser fixtures use Playwright Chromium on CI, with local Chrome and executable-path overrides supported. No release or publishing automation is added.

## 0.3.0

- Rename the extension to Inset, including commands, settings, output, inspector UI, icon asset, development scripts and documentation.
- Use the extension ID `local.inset`, `inset.*` commands/settings and `INSET_*` validation environment variables. Package as `inset-0.3.0.vsix`.
- This is a separate VS Code extension identity. Disable the previous development extension and rename custom settings/keybindings before switching; see README.md.

## 0.2.1

- Add hardware keyboard forwarding when the emulator screen is focused, including editing/navigation keys, modifier chords, composition, and plain-text paste.
- Use USB key encoding and paced modifier transitions, validated against a real Android text field; cancel queued typing and release held keys on focus/presentation changes.
- Send drag moves independently of compositor animation callbacks, accept raw pointer updates, and bound move delivery to 120 Hz.
- Add source/input/browser timing diagnostics and regression coverage for delayed compositor callbacks, focus, composition, paste and live Android keyboard input.
- Match source FPS to the displayed reporting interval and show the longest observed frame gap, avoiding comparisons with the previous second's source count.

## 0.2.0

- Add a React Native component inspector in a reusable VS Code editor tab, with an Inspect action in the emulator toolbar.
- Connect to local Metro/Hermes development runtimes through the existing React Native DevTools bridge; no app dependency or external inspector window.
- Add native element picking/highlighting, searchable component hierarchy, ancestors, props, hooks, state, context, nested value expansion, and native styles/layout.
- Add capability-aware JSON live edits and workspace source navigation using React/Hermes metadata and Metro symbolication.
- Recover from development reloads and runtime disconnects, stop picking on inspector close, and preserve the emulator streaming session.
- Add protocol/source-boundary tests, production inspector webview tests, and live Tally/VS Code validation paths. The initial compatibility target is React Native 0.81.5 / Expo 54 with React DevTools bridge version 2.

## 0.1.2

- Add a compact toolbar, connection indicator, icon navigation, and expandable performance details.
- Add a reusable editor tab with Fit and zoom controls, scrollable panning, and native-coordinate input.
- Share one emulator connection between sidebar and editor; park the other surface and return to the sidebar when the editor closes.
- Test the production HTML, zoomed touch mapping, presentation switching, and full-cap dragging in both modes.

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
