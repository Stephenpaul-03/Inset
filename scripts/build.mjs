import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import './notices.mjs';
await mkdir('artifacts', { recursive: true });
await build({
  entryPoints: ['src/extension.ts'], bundle: true, outfile: 'dist/extension.js',
  platform: 'node', format: 'cjs', target: 'node20', external: ['vscode'],
  sourcemap: true, minify: process.argv.includes('--production'),
});
