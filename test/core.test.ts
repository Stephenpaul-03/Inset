import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseIni, findEmulators } from '../src/discovery/running';
import { requestSize, clampCoordinate } from '../src/transport/geometry';
import { LatestFrameQueue } from '../src/panel/LatestFrameQueue';

test('discovery tolerates incomplete files and preserves tokens containing equals', async () => {
  assert.equal(parseIni('#comment=x\ngrpc.token=a=b=c\r\n[section]\n avd.name = Tablet')['grpc.token'], 'a=b=c');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'portal-discovery-'));
  try {
    await writeFile(path.join(dir, 'pid_1.ini'), 'port.serial=5554\navd.name=Resizable\ngrpc.port=8554\ngrpc.token=a=b');
    await writeFile(path.join(dir, 'pid_2.ini'), 'port.serial=wrong\ngrpc.port=99999');
    await writeFile(path.join(dir, 'pid_3.ini'), 'port.serial=5556\ngrpc.port=99999');
    await mkdir(path.join(dir, 'pid_4.ini'));
    const targets = await findEmulators(dir);
    assert.equal(targets.length, 2);
    assert.deepEqual(targets[0], { serial: 'emulator-5554', name: 'Resizable', grpcPort: 8554, token: 'a=b' });
    assert.equal(targets[1].grpcPort, undefined);
    assert.deepEqual(await findEmulators(path.join(dir, 'missing')), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('adaptive size fits width, height, native resolution, and bandwidth limit', () => {
  assert.deepEqual(requestSize(1080, 2400, 350, 900, 2, false), { width: 700, height: 1556 });
  assert.deepEqual(requestSize(1080, 2400, 350, 600, 2, false), { width: 540, height: 1200 });
  assert.deepEqual(requestSize(2400, 1080, 350, 600, 2, false), { width: 700, height: 315 });
  assert.deepEqual(requestSize(1080, 2400, 350, 900, 2, true), { width: 360, height: 800 });
  assert.deepEqual(requestSize(1080, 2400, 5000, 5000, 2, false), { width: 1080, height: 2400 });
  assert.equal(clampCoordinate(-10, 1080), 0);
  assert.equal(clampCoordinate(1080, 1080), 1079);
});

test('frame queue stays bounded and ignores stale acknowledgments across resets', () => {
  const sent: [string, number][] = [];
  const queue = new LatestFrameQueue<string>((value, id) => sent.push([value, id]));
  queue.offer('first'); queue.offer('stale'); queue.offer('latest');
  assert.equal(sent.length, 1);
  queue.acknowledge(100); assert.equal(sent.length, 1);
  queue.acknowledge(sent[0][1]); assert.equal(sent[1][0], 'latest');
  const staleId = sent[1][1]; queue.reset(); queue.offer('reconnected'); queue.offer('next');
  queue.acknowledge(staleId); assert.equal(sent.length, 3);
  queue.acknowledge(sent[2][1]); assert.equal(sent[3][0], 'next');
});
