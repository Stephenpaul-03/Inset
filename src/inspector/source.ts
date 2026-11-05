import path from 'node:path';
import { realpath } from 'node:fs/promises';

// Debug metadata is app-controlled. It may identify a source file, but must not
// cause navigation to URLs, commands, or files outside the open project roots.
export async function resolveSourceFile(file: string, roots: readonly string[]): Promise<string | undefined> {
  if (!file || file.length > 8192) return;
  let local = file;
  if (local.startsWith('file://')) { try { local = decodeURIComponent(new URL(local).pathname); } catch { return; } }
  else if (/^[a-z][a-z\d+.-]*:/i.test(local) && !/^[a-z]:[\\/]/i.test(local)) return;
  const normalizedRoots = await Promise.all(roots.map(root => realpath(root).catch(() => undefined)));
  for (const root of normalizedRoots) {
    if (!root) continue;
    const candidate = await realpath(path.isAbsolute(local) ? local : path.resolve(root, local)).catch(() => undefined);
    if (!candidate) continue;
    const relative = path.relative(root, candidate);
    if (relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) return candidate;
  }
}
