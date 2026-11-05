import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { FrameChannel } from '../src/panel/FrameChannel';

test('local channel validates capabilities and origins, and transfers binary frames and input', async () => {
  const messages: unknown[] = [];
  const channel = new FrameChannel(message => messages.push(message), () => {});
  const origin = 'vscode-webview://portal-test';
  await channel.start(origin);
  const clients: WebSocket[] = [];
  const connect = (url: string, clientOrigin: string) => new Promise<WebSocket>((resolve, reject) => {
    const client = new WebSocket(url, { origin: clientOrigin }); clients.push(client);
    client.once('open', () => resolve(client)); client.once('error', reject);
  });
  try {
    await assert.rejects(connect(channel.endpoint, 'https://unrelated.example'));
    await assert.rejects(connect(`${channel.cspOrigin}/wrong-capability`, origin));
    const client = await connect(channel.endpoint, origin);
    const received = new Promise<Buffer>(resolve => client.once('message', bytes => resolve(bytes as Buffer)));
    const data = new Uint8Array([10, 20, 30, 255]);
    assert.equal(channel.send({ width: 1, height: 1, nativeWidth: 1080, nativeHeight: 2400, format: 'rgba', data, arrivedAt: 1234567 }, 42), true);
    const frame = await received;
    assert.equal(frame.readUInt32LE(0), 0x5052544c);
    assert.equal(frame.readUInt32LE(4), 42);
    assert.equal(frame.readUInt32LE(16), 1080);
    assert.equal(frame.readDoubleLE(24), 1234567);
    assert.equal(frame.readUInt32LE(32), 1);
    assert.deepEqual([...frame.subarray(40)], [...data]);
    client.send(JSON.stringify({ type: 'pointer', action: 'down', x: 10, y: 20, id: 0 }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal((messages[0] as any).type, 'pointer');
    assert.equal((messages[0] as any).x, 10);
  } finally { clients.forEach(client => client.terminate()); channel.dispose(); }
});
