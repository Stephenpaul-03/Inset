const assert = require('node:assert/strict');
const path = require('node:path');
const { EmulatorGrpcTransport } = require('../out/src/transport/EmulatorGrpcTransport');
const { findEmulators } = require('../out/src/discovery/running');
const grpc = require('@grpc/grpc-js');
const loader = require('@grpc/proto-loader');
const proto = path.resolve(__dirname, '../proto/emulator_controller.proto');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, timeout = 8000) { const start = Date.now(); while (!fn()) { if (Date.now() - start > timeout) throw new Error('Timed out waiting for emulator geometry'); await sleep(50); } }
(async () => {
  const target = (await findEmulators()).find(t => t.grpcPort);
  assert.ok(target, 'Start an emulator in Android Studio first');
  const pkg = grpc.loadPackageDefinition(loader.loadSync(proto, { enums: String, longs: String, defaults: true }));
  const client = new pkg.android.emulation.control.EmulatorController(`127.0.0.1:${target.grpcPort}`, grpc.credentials.createInsecure(), { 'grpc.max_receive_message_length': 64 * 1024 * 1024 });
  const md = new grpc.Metadata(); if (target.token) md.set('authorization', `Bearer ${target.token}`);
  const call = (name, request = {}) => new Promise((resolve, reject) => client[name](request, md, { deadline: Date.now() + 5000 }, (e, r) => e ? reject(e) : resolve(r)));
  const transport = new EmulatorGrpcTransport(proto);
  let latest, error;
  const sizes = [];
  transport.onFrame(frame => { latest = frame; });
  transport.onSizeChange((width, height) => { sizes.push({ width, height }); });
  transport.onError(e => { error = e; });
  const originalRotation = await call('getPhysicalModel', { target: 'ROTATION' });
  const originalMode = await call('getDisplayMode');
  try {
    transport.setViewport(350, 600, 2, false);
    await transport.start(target); await waitFor(() => latest);
    console.log('Attached:', { width: latest.width, height: latest.height, nativeWidth: latest.nativeWidth, nativeHeight: latest.nativeHeight });
    const before = { w: latest.nativeWidth, h: latest.nativeHeight };
    await transport.rotate();
    await waitFor(() => latest.nativeWidth === before.h && latest.nativeHeight === before.w);
    console.log('Rotation:', latest.nativeWidth, latest.nativeHeight);
    await call('setPhysicalModel', { target: 'ROTATION', value: originalRotation.value });
    await waitFor(() => latest.nativeWidth === before.w && latest.nativeHeight === before.h);
    for (const mode of ['FOLDABLE', 'TABLET', 'PHONE']) {
      latest = undefined;
      await call('setDisplayMode', { value: mode });
      await waitFor(() => latest);
      await sleep(2200);
      assert.ok(latest.nativeWidth > 0 && latest.nativeHeight > 0);
      assert.equal(error, undefined);
      console.log(mode, { nativeWidth: latest.nativeWidth, nativeHeight: latest.nativeHeight, width: latest.width, height: latest.height });
    }
    // Confirm input accepts multiple identifiers and pressure-zero release.
    await transport.touch([{ id: 0, x: 5, y: 5, down: true }, { id: 1, x: 10, y: 5, down: true }]);
    await transport.touch([{ id: 0, x: 5, y: 5, down: false }, { id: 1, x: 10, y: 5, down: false }]);
    transport.stop();
    latest = undefined;
    await transport.start(target); await waitFor(() => latest);
    console.log('Reconnect: passed; size transitions:', sizes);
  } finally {
    transport.stop();
    await call('setDisplayMode', originalMode).catch(() => {});
    await call('setPhysicalModel', { target: 'ROTATION', value: originalRotation.value }).catch(() => {});
    client.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
