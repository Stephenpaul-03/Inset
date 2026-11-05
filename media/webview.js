/* global acquireVsCodeApi */
(() => {
  'use strict';
  const vscode = acquireVsCodeApi();
  let socket, socketUrl, reconnectTimer;
  const send = message => {
    if (!active && ['pointer', 'performance'].includes(message.type)) return;
    if (socket?.readyState === WebSocket.OPEN && ['ack', 'pointer', 'performance'].includes(message.type)) socket.send(JSON.stringify(message));
    else vscode.postMessage(message);
  };
  function connectChannel(url) {
    if (!active || !url || (socketUrl === url && socket && socket.readyState < WebSocket.CLOSING)) return;
    socketUrl = url; clearTimeout(reconnectTimer); socket?.close();
    const connection = new WebSocket(url); socket = connection; connection.binaryType = 'arraybuffer';
    connection.onmessage = event => {
      const buffer = event.data;
      if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 40) return;
      const header = new DataView(buffer);
      if (header.getUint32(0, true) !== 0x5052544c) return;
      acceptFrame({ id: header.getUint32(4, true), width: header.getUint32(8, true), height: header.getUint32(12, true),
        nativeWidth: header.getUint32(16, true), nativeHeight: header.getUint32(20, true), arrivedAt: header.getFloat64(24, true),
        format: header.getUint32(32, true) === 1 ? 'rgba' : 'png', bytes: new Uint8Array(buffer, 40) });
    };
    connection.onclose = () => { if (socket === connection) reconnectTimer = setTimeout(() => connectChannel(url), 1000); };
    connection.onerror = () => connection.close();
  }
  const canvas = document.getElementById('screen');
  const stage = document.getElementById('stage');
  const surface = document.getElementById('surface');
  const connection = document.getElementById('connection');
  const fps = document.getElementById('fps');
  const zoom = document.getElementById('zoom');
  const menu = document.getElementById('menu');
  const more = document.getElementById('more');
  const preferences = vscode.getState?.() || {};
  let active = true;
  let mode = document.body.dataset.mode;
  let scaleMode = preferences.zoom || 'fit';
  zoom.value = scaleMode;
  const ctx = canvas.getContext('2d', { alpha: false });
  const devices = document.getElementById('devices');
  const status = document.getElementById('status');
  const notice = document.getElementById('notice');
  const empty = document.getElementById('empty');
  const stats = document.getElementById('stats');
  let nativeWidth = 0, nativeHeight = 0, epoch = 0, pending, decoding = false;
  let drawn = 0, decodeTotal = 0, ageTotal = 0, intervalStart = performance.now();
  let noticeTimer, resizeTimer;
  const pointers = new Map();
  const moves = new Map();
  let moveScheduled = false, wheel = false, wheelGeneration = 0;
  let wheelPoint;
  let sourceFps = 0, frameFormat = 'rgba', channelName = 'bridge';

  function enabled(value) { document.querySelectorAll('[data-device-action]').forEach(button => { button.disabled = !value || !active; }); }
  enabled(false);
  function showNotice(message) {
    notice.textContent = message; notice.hidden = !message;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 8000);
  }
  function viewport() {
    if (!active) return;
    fitCanvas();
    const rect = scaleMode === 'fit' || mode !== 'editor' ? stage.getBoundingClientRect() : canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) send({ type: 'viewport', width: rect.width, height: rect.height, dpr: window.devicePixelRatio || 1 });
    fitCanvas();
  }
  function fitCanvas() {
    if (!nativeWidth || !nativeHeight) return;
    const scale = mode === 'editor' && scaleMode !== 'fit' ? Number(scaleMode) / (window.devicePixelRatio || 1) :
      Math.min(stage.clientWidth / nativeWidth, stage.clientHeight / nativeHeight);
    canvas.style.width = `${Math.max(1, nativeWidth * scale)}px`;
    canvas.style.height = `${Math.max(1, nativeHeight * scale)}px`;
    surface.style.width = `${Math.max(stage.clientWidth, nativeWidth * scale)}px`;
    surface.style.height = `${Math.max(stage.clientHeight, nativeHeight * scale)}px`;
  }
  new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(viewport, 180); }).observe(stage);
  window.addEventListener('resize', viewport);

  async function render() {
    if (decoding) return;
    decoding = true;
    while (pending) {
      const frame = pending; pending = undefined;
      const generation = epoch;
      const started = performance.now();
      try {
        let bitmap;
        if (frame.format !== 'rgba') bitmap = await createImageBitmap(new Blob([frame.bytes], { type: 'image/png' }));
        if (generation === epoch && active) {
          nativeWidth = frame.nativeWidth; nativeHeight = frame.nativeHeight;
          const width = bitmap?.width || frame.width, height = bitmap?.height || frame.height;
          if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
          if (bitmap) ctx.drawImage(bitmap, 0, 0);
          else {
            const bytes = frame.bytes instanceof ArrayBuffer ? new Uint8Array(frame.bytes) : frame.bytes;
            if (bytes.byteLength !== width * height * 4) throw new Error('Invalid raw frame');
            ctx.putImageData(new ImageData(new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength), width, height), 0, 0);
          }
          fitCanvas();
          canvas.classList.add('live'); empty.hidden = true; enabled(true);
          drawn++; decodeTotal += performance.now() - started; ageTotal += Math.max(0, Date.now() - frame.arrivedAt);
        }
        bitmap?.close();
      } catch { showNotice('Could not decode a frame. Refresh the connection.'); }
      finally { send({ type: 'ack', id: frame.id }); }
    }
    decoding = false;
  }
  function acceptFrame(message) {
    if (!active) { send({ type: 'ack', id: message.id }); return; }
    if (pending) send({ type: 'ack', id: pending.id });
    pending = message; void render();
  }
  window.addEventListener('message', event => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    if (message.type === 'frame') {
      acceptFrame(message);
    } else if (message.type === 'devices') {
      devices.replaceChildren();
      if (!message.devices.length || !message.devices.some(d => d.serial === message.selected)) {
        const option = document.createElement('option'); option.value = ''; option.textContent = message.selected ? 'Waiting for selected emulator…' : 'No running emulators'; devices.append(option);
      }
      for (const device of message.devices) {
        const option = document.createElement('option'); option.value = device.serial;
        option.textContent = message.devices.filter(d => d.name === device.name).length > 1 ? `${device.name} (${device.serial})` : device.name;
        option.title = `${device.name} (${device.serial})`; devices.append(option);
      }
      devices.value = message.selected || ''; devices.disabled = !message.devices.length || !active;
      const selected = message.devices.find(device => device.serial === message.selected);
      devices.title = selected ? `${selected.name} (${selected.serial})` : 'Running emulator';
    } else if (message.type === 'status') {
      status.textContent = message.message; status.dataset.state = message.state;
      status.hidden = message.state === 'connected' || !active;
      connection.className = `connection ${message.state}`;
      connection.title = message.state === 'connected' ? 'Connected' : message.message;
      connection.setAttribute('aria-label', connection.title);
      if (message.state !== 'connected') enabled(false);
    } else if (message.type === 'notice') showNotice(message.message);
    else if (message.type === 'config') {
      if (message.active === false && active) {
        releaseAll(); cancelWheel(); ++epoch;
        if (pending) send({ type: 'ack', id: pending.id });
        pending = undefined; nativeWidth = nativeHeight = 0;
        clearTimeout(reconnectTimer); const previous = socket; socket = undefined; previous?.close();
        canvas.classList.remove('live'); empty.hidden = false;
        surface.style.width = surface.style.height = '';
      }
      active = message.active !== false; mode = message.mode || mode;
      const inspect = document.querySelector('[data-button="inspect"]');
      if (inspect) { inspect.setAttribute('aria-pressed', String(!!message.inspectorPicking)); inspect.title = message.inspectorPicking ? 'Stop picking React Native components' : 'Inspect React Native component'; }
      document.body.dataset.mode = mode; document.body.classList.toggle('parked', !active);
      document.getElementById('empty-message').textContent = active ? 'Start an emulator in Android Studio to connect.' : `The emulator is open in the ${mode === 'sidebar' ? 'editor' : 'sidebar'}.`;
      document.getElementById('move-here').hidden = active;
      if (!active) { enabled(false); status.hidden = true; devices.disabled = true; }
      setDetails(preferences.details ?? message.showStats ?? false);
      connectChannel(message.frameChannel); viewport();
    }
    else if (message.type === 'pipeline') { sourceFps = message.sourceFps; frameFormat = message.format; channelName = message.channel; }
    else if (message.type === 'benchmark') { void benchmark(message.durationMs); }
    else if (message.type === 'reset') {
      releaseAll(); cancelWheel(); ++epoch;
      if (pending) send({ type: 'ack', id: pending.id });
      pending = undefined; nativeWidth = nativeHeight = 0;
      canvas.classList.remove('live'); empty.hidden = false; enabled(false);
      surface.style.width = surface.style.height = ''; fps.textContent = 'Idle';
      drawn = decodeTotal = ageTotal = 0; intervalStart = performance.now();
    }
  });
  setInterval(() => {
    if (!active) return;
    const now = performance.now();
    fps.textContent = drawn ? `${Math.round(drawn * 1000 / (now - intervalStart))} FPS` : 'Idle';
    send({ type: 'performance', fps: drawn * 1000 / (now - intervalStart), decodeMs: drawn ? decodeTotal / drawn : 0,
      ageMs: drawn ? ageTotal / drawn : 0, width: canvas.width, height: canvas.height,
      documentHidden: document.hidden ? 1 : 0 });
    stats.textContent = drawn ? `${(drawn * 1000 / (now - intervalStart)).toFixed(0)} fps · source ${sourceFps} · ${frameFormat} · ${channelName} · draw ${(decodeTotal / drawn).toFixed(1)} ms · age ${(ageTotal / drawn).toFixed(0)} ms · ${canvas.width}×${canvas.height}` : 'Idle · frames arrive when the screen changes';
    drawn = decodeTotal = ageTotal = 0; intervalStart = now;
  }, 1000);
  devices.addEventListener('change', () => { if (devices.value) send({ type: 'selectDevice', serial: devices.value }); });
  document.querySelectorAll('[data-button]').forEach(button => button.addEventListener('click', () => {
    releaseAll(); cancelWheel(); showNotice(''); closeMenu(); send({ type: 'button', name: button.dataset.button });
  }));
  function savePreferences() { vscode.setState?.(preferences); }
  function setDetails(expanded) {
    stats.hidden = !expanded;
    fps.setAttribute('aria-expanded', String(!!expanded));
    document.getElementById('toggle-details').setAttribute('aria-pressed', String(!!expanded));
  }
  function toggleDetails() { preferences.details = stats.hidden; setDetails(preferences.details); savePreferences(); closeMenu(); }
  function closeMenu() { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); }
  more.addEventListener('click', () => { menu.hidden = !menu.hidden; more.setAttribute('aria-expanded', String(!menu.hidden)); if (!menu.hidden) menu.querySelector('button').focus(); });
  document.addEventListener('click', event => { if (!event.target.closest('.overflow')) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) { closeMenu(); more.focus(); } });
  fps.addEventListener('click', toggleDetails);
  document.getElementById('toggle-details').addEventListener('click', toggleDetails);
  zoom.addEventListener('change', () => {
    scaleMode = zoom.value; preferences.zoom = scaleMode; savePreferences();
    releaseAll(); cancelWheel(); viewport(); stage.scrollTop = stage.scrollLeft = 0;
  });
  function point(event) {
    const r = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(nativeWidth - 1, Math.round((event.clientX - r.left) / r.width * nativeWidth))),
      y: Math.max(0, Math.min(nativeHeight - 1, Math.round((event.clientY - r.top) / r.height * nativeHeight))) };
  }
  function pointer(action, id, p) { send({ type: 'pointer', action, id, ...p }); }
  function flushMoves() {
    for (const [id, p] of moves) pointer('move', id, p);
    moves.clear(); moveScheduled = false;
  }
  canvas.addEventListener('pointerdown', event => {
    if (!active || !nativeWidth || event.button !== 0 || wheel) return;
    const used = [...pointers.values()].map(p => p.id);
    const id = Array.from({ length: 10 }, (_, i) => i).find(i => !used.includes(i));
    if (id === undefined) return;
    event.preventDefault(); canvas.focus(); canvas.setPointerCapture(event.pointerId);
    const p = point(event); pointers.set(event.pointerId, { id, ...p }); pointer('down', id, p);
  });
  canvas.addEventListener('pointermove', event => {
    const previous = pointers.get(event.pointerId); if (!previous) return;
    const p = point(event); pointers.set(event.pointerId, { id: previous.id, ...p }); moves.set(previous.id, p);
    if (!moveScheduled) { moveScheduled = true; requestAnimationFrame(flushMoves); }
  });
  function release(event) {
    const p = pointers.get(event.pointerId); if (!p) return;
    flushMoves(); pointer('up', p.id, p); pointers.delete(event.pointerId);
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  function releaseAll() { flushMoves(); for (const p of pointers.values()) pointer('up', p.id, p); pointers.clear(); }
  function cancelWheel() {
    ++wheelGeneration;
    if (wheel && wheelPoint) pointer('up', 0, wheelPoint);
    wheelPoint = undefined; wheel = false;
  }
  window.addEventListener('blur', () => { releaseAll(); cancelWheel(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { releaseAll(); cancelWheel(); } else viewport(); });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function benchmark(durationMs) {
    releaseAll(); cancelWheel(); canvas.focus();
    const generation = epoch, width = nativeWidth, height = nativeHeight;
    const started = performance.now();
    let direction = 1;
    try {
      while (epoch === generation && performance.now() - started < durationMs) {
        const from = height * (direction > 0 ? .78 : .22), to = height * (direction > 0 ? .22 : .78);
        pointer('down', 0, { x: width / 2, y: from });
        const segment = performance.now();
        let y = from;
        while (epoch === generation && performance.now() - segment < 1000) {
          await new Promise(requestAnimationFrame);
          y = from + (to - from) * Math.min(1, (performance.now() - segment) / 1000);
          pointer('move', 0, { x: width / 2, y });
        }
        pointer('up', 0, { x: width / 2, y }); direction *= -1;
      }
    } finally { send({ type: 'benchmarkDone' }); }
  }
  canvas.addEventListener('wheel', async event => {
    event.preventDefault();
    if (!nativeWidth || wheel || pointers.size || (!event.deltaY && !event.deltaX)) return;
    wheel = true;
    const generation = wheelGeneration;
    const w = nativeWidth, h = nativeHeight;
    const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1;
    const dx = Math.max(-w * .4, Math.min(w * .4, event.deltaX * factor * w / canvas.clientWidth));
    const dy = Math.max(-h * .4, Math.min(h * .4, event.deltaY * factor * h / canvas.clientHeight));
    let p = { x: w / 2 + dx / 2, y: h / 2 + dy / 2 };
    wheelPoint = p;
    pointer('down', 0, p);
    try {
      for (let i = 1; i <= 8; i++) {
        await delay(12);
        if (generation !== wheelGeneration) break;
        p = { x: w / 2 + dx / 2 - dx * i / 8, y: h / 2 + dy / 2 - dy * i / 8 };
        wheelPoint = p;
        pointer('move', 0, p);
      }
    } finally { if (generation === wheelGeneration) { pointer('up', 0, p); wheel = false; wheelPoint = undefined; } }
  }, { passive: false });
  send({ type: 'ready', origin: window.location.origin }); viewport();
})();
