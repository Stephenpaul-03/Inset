import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface EmulatorTarget {
  serial: string;
  name: string;
  grpcPort?: number;
  token?: string;
}

export function parseIni(text: string): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*[;#[]/.test(line)) continue;
    const i = line.indexOf('=');
    if (i > 0) result[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return result;
}

export function candidateDirs(override?: string): string[] {
  if (override) return [override];
  return [...new Set([
    path.join(os.homedir(), 'Library/Caches/TemporaryItems/avd/running'),
    path.join(os.tmpdir(), 'avd/running'),
    path.join(os.homedir(), '.android/avd/running'),
    ...(process.env.XDG_RUNTIME_DIR ? [path.join(process.env.XDG_RUNTIME_DIR, 'avd/running')] : []),
    ...(process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, 'Temp/avd/running')] : []),
  ])];
}

export async function findEmulators(override?: string): Promise<EmulatorTarget[]> {
  const targets = new Map<string, EmulatorTarget>();
  for (const dir of candidateDirs(override)) {
    let files: string[];
    try { files = await fs.readdir(dir); } catch { continue; }
    for (const file of files.filter(f => /^pid_\d+\.ini$/.test(f))) {
      try {
        const ini = parseIni(await fs.readFile(path.join(dir, file), 'utf8'));
        const serialPort = Number(ini['port.serial']);
        if (!Number.isInteger(serialPort) || serialPort < 1 || serialPort > 65535) continue;
        const grpcPort = Number(ini['grpc.port']);
        const serial = `emulator-${serialPort}`;
        if (!targets.has(serial)) targets.set(serial, {
          serial, name: ini['avd.name'] || ini['avd.id'] || serial,
          grpcPort: Number.isInteger(grpcPort) && grpcPort > 0 && grpcPort <= 65535 ? grpcPort : undefined,
          token: ini['grpc.token'] || undefined,
        });
      } catch { /* Discovery files can disappear during an emulator restart. */ }
    }
  }
  return [...targets.values()].sort((a, b) => a.serial.localeCompare(b.serial));
}
