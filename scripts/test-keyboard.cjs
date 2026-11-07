const assert = require('node:assert/strict');
const path = require('node:path');
const { EmulatorGrpcTransport } = require('../out/src/transport/EmulatorGrpcTransport');
const { findEmulators } = require('../out/src/discovery/running');
const { Adb } = require('../out/src/adb/adb');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const target = (await findEmulators()).find(target => target.grpcPort);
  assert.ok(target, 'Start an emulator first');
  const adb = new Adb(() => ({}));
  const activity = (await adb.run(['-s', target.serial, 'shell', 'dumpsys', 'activity', 'activities']))
    .match(/topResumedActivity=.*?\s([\w.]+\/[\w.$]+)/)?.[1];
  const transport = new EmulatorGrpcTransport(path.resolve(__dirname, '../proto/emulator_controller.proto'));
  transport.onError(error => { throw error; });
  let clipboard;
  const press = key => transport.key({ key, action: 'press' });
  const chord = async key => {
    await transport.key({ key: 'Control', action: 'down' });
    try { await press(key); } finally { await transport.key({ key: 'Control', action: 'up' }); }
  };
  const query = async () => {
    await chord('a'); await chord('c'); await sleep(300);
    return (await transport.call('getClipboard', {})).text;
  };
  try {
    await transport.start(target);
    clipboard = await transport.call('getClipboard', {});
    await adb.run(['-s', target.serial, 'shell', 'am', 'start', '-a', 'android.settings.APP_SEARCH_SETTINGS']);
    await sleep(800);
    await chord('a'); await press('Backspace');
    await transport.text('Inset keyboard 123!'); await sleep(250);
    assert.ok(await query() === 'Inset keyboard 123!', 'Typing, select-all and copy must reach the Android query');
    await transport.paste('Inset paste 🙂'); await sleep(300);
    assert.ok(await query() === 'Inset paste 🙂', 'Unicode paste must replace the selected query');
    await press('ArrowRight'); await press('Backspace'); await transport.text('!'); await sleep(200);
    assert.ok(await query() === 'Inset paste !', 'Arrow navigation and Backspace must edit the query');
    console.log('Live keyboard passed: real Android typing, modifiers/select-all/copy, Unicode paste, arrow navigation and Backspace.');
  } finally {
    await chord('a').then(() => press('Backspace')).catch(() => {});
    if (clipboard) await transport.call('setClipboard', clipboard).catch(() => {});
    await transport.releaseKeys().catch(() => {}); transport.stop();
    if (activity) await adb.run(['-s', target.serial, 'shell', 'am', 'start', '-n', activity]);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
