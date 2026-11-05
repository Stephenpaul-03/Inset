import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const directories = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(p => p !== root);
const parts = ['# Third-party notices\n\nThis private build bundles the following packages. Their license texts follow.'];
for (const directory of [...new Set(directories)].sort()) {
  const p = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
  const names = (await fs.readdir(directory)).filter(n => /^(licen[sc]e|copying|notice)([.\-_]|$)/i.test(n));
  parts.push(`\n## ${p.name} ${p.version}\n\nLicense: ${p.license || 'see package notices'}.`);
  for (const name of names) {
    if ((await fs.stat(path.join(directory, name))).isFile()) parts.push(`\n### ${name}\n\n\`\`\`text\n${await fs.readFile(path.join(directory, name), 'utf8')}\n\`\`\``);
  }
  if (!names.length) throw new Error(`Missing license text for ${p.name}`);
}
const proto = await fs.readFile(path.join(root, 'proto/emulator_controller.proto'));
parts.push(`\n## Android Emulator controller protocol\n\nCopyright (C) 2018 The Android Open Source Project.\n\nPinned from the locally installed Android Emulator 36.5.11 distribution. SHA-256: ${createHash('sha256').update(proto).digest('hex')}.\n\nUpstream: https://android.googlesource.com/platform/prebuilts/android-emulator/+/refs/heads/main/linux-x86_64/lib/emulator_controller.proto\n\nLicensed under Apache License 2.0; the full Apache license text above for @grpc/grpc-js also applies. The protocol file retains its original copyright and license header.`);
const notices = (parts.join('\n') + '\n').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '');
await fs.writeFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), notices);
