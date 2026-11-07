const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { runTests } = require('@vscode/test-electron');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'inset-vscode-'));
delete process.env.ELECTRON_RUN_AS_NODE;
runTests({
  vscodeExecutablePath: '/Applications/Visual Studio Code.app/Contents/MacOS/Code',
  extensionDevelopmentPath: process.env.INSET_EXTENSION_PATH || path.resolve(__dirname, '..'),
  extensionTestsPath: path.resolve(__dirname, '../out/test/extension/suite.js'),
  launchArgs: ['--user-data-dir', profile, '--extensions-dir', path.join(profile, 'extensions'), '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--disable-updates'],
}).catch(e => { console.error(e); process.exitCode = 1; });
