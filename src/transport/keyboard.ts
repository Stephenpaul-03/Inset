export interface KeyInput { key: string; action: 'down' | 'up' | 'press' }
const usbKeys: Record<string, number> = {
  Enter: 0x28, Escape: 0x29, Backspace: 0x2a, Tab: 0x2b, CapsLock: 0x39,
  Insert: 0x49, Home: 0x4a, PageUp: 0x4b, Delete: 0x4c, End: 0x4d, PageDown: 0x4e,
  ArrowRight: 0x4f, ArrowLeft: 0x50, ArrowDown: 0x51, ArrowUp: 0x52, NumLock: 0x53,
  Control: 0xe0, Shift: 0xe1, Alt: 0xe2,
};
export function keyRequest(input: KeyInput, chord = false): Record<string, string | number> {
  const fn = /^F([1-9]|1[0-2])$/.exec(input.key);
  const letter = chord && /^[a-z]$/i.test(input.key) ? input.key.toLowerCase().charCodeAt(0) - 97 + 4 : undefined;
  const usage = usbKeys[input.key] ?? (fn ? 0x39 + Number(fn[1]) : letter);
  const eventType = { down: 'keydown', up: 'keyup', press: 'keypress' }[input.action];
  return usage === undefined ? { key: input.key, eventType } : { codeType: 'Usb', keyCode: 0x70000 + usage, eventType };
}
export type KeyboardMessage = { type: 'keyboard' } & KeyInput |
  { type: 'text' | 'paste'; text: string } | { type: 'releaseKeys' };
const namedKeys = new Set(['Backspace', 'Delete', 'Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Control', 'Shift', 'Alt', 'CapsLock', 'NumLock',
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`)]);
export function keyboardMessage(value: any): KeyboardMessage | undefined {
  if (value?.type === 'releaseKeys') return { type: 'releaseKeys' };
  if (value?.type === 'keyboard' && ['down', 'up', 'press'].includes(value.action) && typeof value.key === 'string' &&
    (namedKeys.has(value.key) || /^[\x20-\x7e]$/.test(value.key))) return { type: 'keyboard', key: value.key, action: value.action };
  if ((value?.type === 'text' || value?.type === 'paste') && typeof value.text === 'string' && value.text.length > 0 &&
    Buffer.byteLength(value.text, 'utf8') <= (value.type === 'paste' ? 60000 : 4096) && !value.text.includes('\0')) return { type: value.type, text: value.text };
}
