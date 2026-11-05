import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as vscode from 'vscode';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

// Exercise the provider's automatic rediscovery without restarting the owner's
// real emulator. The fake endpoint speaks the same protocol over loopback.
export async function verifyReconnect(extensionPath: string, waitFor: (predicate: (d: any) => boolean) => Promise<any>): Promise<string[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-restart-'));
  const definition = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(extensionPath, 'proto/emulator_controller.proto'), { enums: String, longs: String, defaults: true })) as any;
  const image = await fs.readFile(path.join(extensionPath, 'test/fixtures/screen.png'));
  const servers: grpc.Server[] = [];
  const streams = new Set<grpc.ServerWritableStream<any, any>>();
  async function server(token: string): Promise<number> {
    const server = new grpc.Server(); servers.push(server);
    const authorize = (call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>, response: any) => {
      if (call.metadata.get('authorization')[0] !== `Bearer ${token}`) cb({ code: grpc.status.UNAUTHENTICATED, message: 'Invalid token' });
      else cb(null, response);
    };
    server.addService(definition.android.emulation.control.EmulatorController.service, {
      getStatus: (call: any, cb: any) => authorize(call, cb, { booted: true, version: 'fixture' }),
      getScreenshot: (call: any, cb: any) => authorize(call, cb, { format: { format: 'PNG', width: 1080, height: 2400 }, image }),
      getDisplayConfigurations: (call: any, cb: any) => authorize(call, cb, { displays: [{ display: 0, width: 1080, height: 2400 }] }),
      streamScreenshot: (call: grpc.ServerWritableStream<any, any>) => {
        streams.add(call);
        const frame = () => call.write({ format: { format: 'PNG', width: 540, height: 1200 }, image });
        frame(); const timer = setInterval(frame, 200);
        call.on('cancelled', () => { clearInterval(timer); streams.delete(call); });
      },
      sendTouch: (call: any, cb: any) => authorize(call, cb, {}),
    });
    return new Promise((resolve, reject) => server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (e, port) => e ? reject(e) : resolve(port)));
  }
  async function advertise(port: number, token: string, name: string) {
    await fs.writeFile(path.join(dir, 'pid_123.ini'), `port.serial=5554\navd.name=${name}\ngrpc.port=${port}\ngrpc.token=${token}\n`);
  }
  const config = vscode.workspace.getConfiguration('portal');
  const previous = config.inspect<string>('discoveryPath')?.globalValue;
  try {
    const first = await server('first');
    await advertise(first, 'first', 'Restart fixture A');
    await config.update('discoveryPath', dir, vscode.ConfigurationTarget.Global);
    await waitFor(d => d.status.state === 'connected' && d.status.message === 'Restart fixture A');
    servers[0].forceShutdown();
    await waitFor(d => d.status.state !== 'connected');
    const second = await server('second');
    await advertise(second, 'wrong', 'Restart fixture B');
    await waitFor(d => d.status.state === 'error' && /authentication/i.test(d.status.message));
    await advertise(second, 'second', 'Restart fixture B');
    const restored = await waitFor(d => d.status.state === 'connected' && d.status.message === 'Restart fixture B');
    assert.equal(restored.selected, 'emulator-5554');
    return ['automatic reconnect after port/token change (simulated restart)', 'authentication error and recovery'];
  } finally {
    await config.update('discoveryPath', previous, vscode.ConfigurationTarget.Global);
    for (const stream of streams) stream.end();
    servers.forEach(s => s.forceShutdown());
    await fs.rm(dir, { recursive: true, force: true });
  }
}
