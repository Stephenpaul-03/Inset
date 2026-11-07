# Inset

An Android emulator and React Native component inspector inside VS Code.

Inset attaches to an **already-running Android emulator** and keeps it beside your code, in a compact sidebar or an editor tab. It also lets you pick and inspect React Native components without leaving VS Code.

**Status: pre-v1 development · v0.3.0.** There is no Marketplace release or published VSIX. Distribution is planned for v1; this repository is for development and validation.

## What works today

- Attach to running Android emulators, including Resizable AVDs.
- Move between sidebar and editor using one emulator session; fit or zoom the display.
- Tap, drag, scroll, rotate, use Android navigation, type and paste with the hardware keyboard.
- Stream raw frames over a local channel with a 60 FPS target and expandable timing details.
- Inspect supported React Native development builds: native component picking, searchable tree, props/hooks/state, styles/layout, temporary runtime edits and workspace source navigation.

60 FPS is a target, not a guarantee for every app or machine. Android sends changed frames; idle screens and gesture pauses lower the FPS counter. See [usage and performance diagnostics](docs/USAGE.md) and [measured validation results](VALIDATION.md).

## Requirements

- VS Code 1.95 or later.
- A running Android Emulator with local gRPC enabled by the emulator, and Android SDK platform-tools (`adb`). Inset does not start or manage an AVD.
- For React Native inspection: a trusted workspace, local Metro, and a compatible Hermes development build. React Native 0.81.5 / React 19.1 / Expo 54 is the verified combination. Release builds and older debugger protocols are outside the current adapter.

Live emulator use has been validated on macOS. Linux and Windows emulator discovery still need live validation; Linux CI covers source and browser fixtures only. Physical devices, iOS, recording and full React profiling are outside the current scope.

## Run from source

Use Node.js 24 (see [.nvmrc](.nvmrc)).

```sh
npm ci
npm run build
```

Open the repository in VS Code and press **F5** to launch the extension development window. Start your emulator, then run **Inset: Open Emulator**. For inspection, open the app's development build with Metro running and run **Inset: Open React Native Inspector**.

To validate without an emulator:

```sh
npx playwright install chromium
npm run check
```

GitHub Actions runs the build, core/channel tests and production browser fixtures. It does not publish packages, create releases or run live emulator/Metro tests. Live checks remain a separate development step.

## Project guides

- [Using Inset](docs/USAGE.md) — controls, settings, keyboard, inspector, diagnostics and switching from the previous development build.
- [Contributing](CONTRIBUTING.md) — setup, checks, source layout and live validation.
- [Roadmap to v1](ROADMAP.md) — remaining validation and release gates.
- [Changelog](CHANGELOG.md) — version history.
- [Security](SECURITY.md) — reporting and trust boundaries.
- [Repository setup](docs/REPOSITORY_SETUP.md) — first push and GitHub settings for the maintainer.
- [Validation](VALIDATION.md) and [handoff](HANDOFF.md) — measured results and historical implementation notes.

## License

The original project code is not currently offered under an open-source license. See [LICENSE.md](LICENSE.md). Dependency and Android protocol licenses remain in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
