# GitHub repository setup

Maintainer notes for the initial push. No GitHub owner/URL is hardcoded while the destination repository is being created.

## First push

Create an empty repository on GitHub, without initializing a README, license or gitignore, so the existing history can be pushed directly. Keep it private during development if public availability is being deferred until v1.

After the actual repository URL is known, run from the repository root, replacing `OWNER/inset` with the chosen destination:

```sh
git remote add origin git@github.com:OWNER/inset.git
git push -u origin main
```

Then add the confirmed repository, homepage and issues URLs to `package.json`. Do not guess an owner, attach a different repository or publish the extension as part of the first push.

Suggested description: **Android emulator and React Native component inspector inside VS Code.** Suggested topics: `vscode-extension`, `android-emulator`, `react-native`, `developer-tools`, `hermes`.

## Repository settings

- Enable Issues and GitHub Actions. The templates and CI workflow are already tracked.
- Let the first CI run complete, then protect `main` with a rule requiring the **Build and tests** check and pull requests. Adjust review requirements to the actual maintainer/team size.
- Enable private vulnerability reporting if available, so SECURITY.md has a direct private reporting route.
- Dependabot configuration checks npm dependencies and GitHub Actions weekly. Review updates and their CI results before merging.
- Do not add publishing credentials, release automation, Pages hosting or Marketplace integration yet.

## What CI does

The `CI` workflow runs on pushes to `main`, pull requests and manual dispatch. It uses Node.js 24, `npm ci`, Playwright Chromium, and `npm run check` on Linux. The official checkout/setup-node actions are pinned to reviewed commits. The workflow token has read-only repository contents access, and checkout does not persist credentials.

It builds and checks types, runs core and local-channel tests, and exercises both production webviews using neutral browser fixtures. It also checks whitespace and that regenerated third-party notices match the tracked file. It does not run an emulator, Metro or a live VS Code host, and it does not package, upload or publish VSIX files.

Live emulator/RN validation and v1 release gates are recorded in [CONTRIBUTING.md](../CONTRIBUTING.md), [ROADMAP.md](../ROADMAP.md) and [VALIDATION.md](../VALIDATION.md). A first successful hosted CI run still needs confirmation after the push; local checks cannot prove the GitHub runner environment in advance.
