# Security

Inset is a pre-v1 development extension. Security fixes target current development on `main`; there is no supported public release line yet.

## Reporting a vulnerability

Use the repository's **Security → Report a vulnerability** option if private reporting is enabled. If unavailable, contact the repository owner privately before sharing exploit details. Do not put credentials or sensitive application data in a public issue. Ordinary bugs can use the issue templates.

Include the affected commit/version, relevant platform/runtime versions, reproduction steps and the impact. Use synthetic data and remove emulator tokens, local user paths, clipboard contents, source secrets and private component values from evidence.

## Relevant boundaries

- The emulator transport connects to local gRPC. Authentication tokens remain in the extension host.
- The raw-frame channel binds to loopback and uses a per-view capability plus an exact Origin check. It is not a remote streaming endpoint.
- React Native inspection evaluates development-runtime expressions and supports temporary runtime edits. It requires a trusted workspace and local Metro; connect only to development apps you intend to inspect.
- Source navigation is restricted to real files under the open workspace roots, including symlink checks.
- Screenshots, diagnostics and runtime component values can contain application data. Review them before sharing, even when the diagnostics omit transport credentials.

Do not expose emulator gRPC or Metro to the internet to make Inset work remotely. Keep trust checks, input validation and local-channel access controls intact when proposing changes.
