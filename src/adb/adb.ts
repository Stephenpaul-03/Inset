import { execFile, spawn, ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface AdbOptions { adbPath?: string; sdkPath?: string }
export function locateAdb(options: AdbOptions): string {
  if (options.adbPath) return options.adbPath;
  const sdk = options.sdkPath || process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
    (process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Android/sdk') :
      process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'Android/Sdk') :
        path.join(os.homedir(), 'Android/Sdk'));
  const candidate = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  return existsSync(candidate) ? candidate : 'adb';
}

export class Adb {
  private tracker?: ChildProcess;
  constructor(private readonly options: () => AdbOptions) {}
  run(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(locateAdb(this.options()), args, { timeout: 5000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (!error) resolve(stdout.trim());
        else if ((error as NodeJS.ErrnoException).code === 'ENOENT') reject(new Error('adb not found. Set Inset: Adb Path or SDK Path in Settings.'));
        else reject(new Error(`adb command failed. Check that the emulator is online. ${error.message}`));
      });
    });
  }
  async devices(): Promise<Map<string, string>> {
    const text = await this.run(['devices']);
    return new Map(text.split(/\r?\n/).flatMap(line => {
      const match = /^(emulator-\d+)\s+(\S+)/.exec(line);
      return match ? [[match[1], match[2]]] : [];
    }));
  }
  key(serial: string, name: 'back' | 'home' | 'recents'): Promise<string> {
    return this.run(['-s', serial, 'shell', 'input', 'keyevent', { back: '4', home: '3', recents: '187' }[name]]);
  }
  track(onChange: () => void): void {
    this.stop();
    const child = spawn(locateAdb(this.options()), ['track-devices'], { stdio: ['ignore', 'pipe', 'ignore'] });
    this.tracker = child;
    child.stdout?.on('data', onChange);
    child.on('error', () => { /* Periodic discovery still works; devices() reports actionable errors. */ });
    child.on('exit', () => { if (this.tracker === child) this.tracker = undefined; });
  }
  stop(): void { this.tracker?.kill(); this.tracker = undefined; }
}
