import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
execFileSync(process.execPath, [path.join(root, 'node_modules/@vscode/vsce/vsce'), 'package', '--no-dependencies', '--allow-missing-repository',
  '--out', `artifacts/${manifest.name}-${manifest.version}.vsix`], { cwd: root, stdio: 'inherit' });
