import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, symlink, rm, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ComponentTree } from '../src/inspector/ComponentTree';
import { metroAddress } from '../src/inspector/discovery';
import { resolveSourceFile } from '../src/inspector/source';

test('component operations preserve Unicode names, renderer IDs, ordering and root removal', () => {
  const tree = new ComponentTree();
  const name = [...'Account 📱'].map(char => char.codePointAt(0)!);
  tree.apply([3, 10, name.length + 1, name.length, ...name, 1, 10, 11, 1, 0, 1, 1,
    1, 11, 5, 10, 0, 1, 0, 1, 12, 7, 11, 11, 0, 0, 1, 13, 7, 11, 11, 0, 0]);
  assert.equal(tree.nodes.get(11)?.name, 'Account 📱');
  assert.equal(tree.nodes.get(11)?.rendererID, 3);
  assert.deepEqual(tree.nodes.get(11)?.children, [12, 13]);
  tree.apply([3, 10, 0, 3, 11, 2, 13, 12, 5, 11, 2, 0, 7, 11, 1]);
  assert.deepEqual(tree.nodes.get(11)?.children, [13, 12]);
  const snapshot = tree.snapshot();
  assert.throws(() => tree.apply([3, 10, 0, 2, 1, 12, 99]), /Unsupported/);
  assert.deepEqual(tree.snapshot(), snapshot, 'Bad protocol messages must not partially change the tree');
  assert.throws(() => tree.apply([3, 10, 0, 3, 11, 100]), /ordering/);
  tree.apply([3, 10, 0, 2, 1, 12]);
  assert.deepEqual(tree.nodes.get(11)?.children, [13]);
  tree.apply([3, 10, 0, 6]); assert.equal(tree.nodes.size, 0);
});

test('inspector discovery accepts only explicit local HTTP Metro addresses', () => {
  assert.equal(metroAddress('http://localhost:8082/anything').origin, 'http://localhost:8082');
  assert.equal(metroAddress('http://[::1]:8081').hostname, '[::1]');
  for (const address of ['https://127.0.0.1:8081', 'http://example.com:8081', 'file:///tmp/a', 'http://user:pass@localhost:8081']) assert.throws(() => metroAddress(address));
});

test('source navigation stays inside real workspace roots including through symlinks', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'inset-source-'));
  try {
    const root = path.join(dir, 'project'); await mkdir(root);
    const file = path.join(root, 'Account.tsx'); await writeFile(file, 'export const Account = 1;');
    const outside = path.join(dir, 'private.txt'); await writeFile(outside, 'private');
    await symlink(outside, path.join(root, 'link.tsx'));
    assert.equal(await resolveSourceFile(file, [root]), await realpath(file));
    assert.equal(await resolveSourceFile('Account.tsx', [root]), await realpath(file));
    assert.equal(await resolveSourceFile(outside, [root]), undefined);
    assert.equal(await resolveSourceFile('../private.txt', [root]), undefined);
    assert.equal(await resolveSourceFile('link.tsx', [root]), undefined);
    assert.equal(await resolveSourceFile('command:workbench.action.quit', [root]), undefined);
    assert.equal(await resolveSourceFile('https://example.com/Account.tsx', [root]), undefined);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
