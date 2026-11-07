# Roadmap to v1

Inset is currently v0.3.0. The repository supports development and validation; v1 is the planned distribution milestone. This roadmap has no promised release date.

## Implemented

- Running Android emulator discovery, raw/local streaming, navigation, rotation and reconnect handling.
- Compact sidebar and reusable editor presentation sharing one session.
- Focused hardware keyboard, text composition, paste and gesture input.
- React Native inspector inside VS Code with native picking, runtime data/edits, layout and workspace source navigation for the verified Hermes/Metro combination.
- Source/browser tests, live validation tools, performance diagnostics and recorded measurements.

## Before v1

- Validate the everyday workflow over extended sessions: dragging/typing, app reloads, inspector reconnects, view moves and repeated focus changes.
- Exercise real emulator process restart and host sleep/wake, beyond simulated port/token changes.
- Validate multiple running emulators, switching devices, and input accuracy through resized/rotated modes.
- Measure sustained motion in the normal VS Code workspace, including inspector-connected use. Keep slow samples and distinguish idle/change-driven delivery from actual stutters.
- Decide the supported OS and React Native/Expo version matrix from live results. Linux/Windows discovery and additional runtimes remain unverified.
- Review keyboard/clipboard behavior, error recovery, narrow layouts, keyboard navigation and accessibility in the real extension host.
- Finalize installation/update instructions, distribution identity, licensing and name availability before release. Review third-party notices with the shipped dependencies.
- Define v1 acceptance results in VALIDATION.md, then prepare the release and VSIX/Marketplace workflow separately.

## Outside the current v1 scope

Physical Android devices, iOS simulators, screen recording, full React profiling, remote Metro and support for every historical React Native debugger protocol. Revisit these after the primary emulator/inspection workflow is dependable.

See [VALIDATION.md](VALIDATION.md) for evidence and limitations rather than treating this roadmap as a claim that every scenario already passes.
