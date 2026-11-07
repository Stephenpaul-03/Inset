import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyboardMessage, keyRequest } from '../src/transport/keyboard';

test('keyboard input accepts text and known keys without exposing arbitrary RPCs', () => {
  assert.deepEqual(keyboardMessage({ type: 'keyboard', key: 'ArrowLeft', action: 'press', method: 'shutdown' }), { type: 'keyboard', key: 'ArrowLeft', action: 'press' });
  assert.deepEqual(keyboardMessage({ type: 'keyboard', key: 'Control', action: 'up' }), { type: 'keyboard', key: 'Control', action: 'up' });
  assert.deepEqual(keyboardMessage({ type: 'paste', text: 'தமிழ்\n🙂' }), { type: 'paste', text: 'தமிழ்\n🙂' });
  assert.deepEqual(keyboardMessage({ type: 'releaseKeys' }), { type: 'releaseKeys' });
  for (const value of [null, { type: 'keyboard', key: 'Power', action: 'press' }, { type: 'keyboard', key: 'a', action: 'execute' },
    { type: 'keyboard', key: 'constructor', action: 'down' }, { type: 'text', text: 'a\0b' }, { type: 'text', text: 'a'.repeat(4097) },
    { type: 'paste', text: '🙂'.repeat(16000) }, { type: 'text', text: '' }]) assert.equal(keyboardMessage(value), undefined);
});

test('USB encoding preserves down/up semantics for modifiers and Android editing keys', () => {
  assert.deepEqual(keyRequest({ key: 'Backspace', action: 'press' }), { codeType: 'Usb', keyCode: 0x7002a, eventType: 'keypress' });
  assert.deepEqual(keyRequest({ key: 'Control', action: 'down' }), { codeType: 'Usb', keyCode: 0x700e0, eventType: 'keydown' });
  assert.deepEqual(keyRequest({ key: 'Shift', action: 'up' }), { codeType: 'Usb', keyCode: 0x700e1, eventType: 'keyup' });
  assert.deepEqual(keyRequest({ key: 'v', action: 'press' }, true), { codeType: 'Usb', keyCode: 0x70019, eventType: 'keypress' });
  assert.deepEqual(keyRequest({ key: '!', action: 'press' }), { key: '!', eventType: 'keypress' });
});
