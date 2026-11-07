/* global acquireVsCodeApi */
(() => {
  'use strict';
  const vscode = acquireVsCodeApi();
  let socket, socketUrl, reconnectTimer;
  const send = message => {
    if ((message.type === 'paste' || message.type === 'text') && new TextEncoder().encode(JSON.stringify(message)).byteLength > 60000) {
      showNotice('Paste a smaller block of text (under 60 KB).'); return;
    }
    if (!active && ['pointer', 'performance', 'keyboard', 'text', 'paste'].includes(message.type)) return;
    if (socket?.readyState === WebSocket.OPEN && ['ack', 'pointer', 'performance', 'keyboard', 'text', 'paste', 'releaseKeys'].includes(message.type)) socket.send(JSON.stringify(message));
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
  const keyboard = document.getElementById('keyboard-input');
  const heldModifiers = new Set();
  let composing = false;
  function releaseKeyboard() {
    if (heldModifiers.size) send({ type: 'releaseKeys' });
    heldModifiers.clear(); composing = false; keyboard.value = '';
  }
  function focusKeyboard() { if (active && nativeWidth) keyboard.focus({ preventScroll: true }); }
  canvas.addEventListener('focus', focusKeyboard);
  keyboard.addEventListener('focus', () => canvas.classList.add('keyboard-focused'));
  keyboard.addEventListener('blur', () => { canvas.classList.remove('keyboard-focused'); releaseKeyboard(); });
  function syncModifiers(event, command = false) {
    const desired = new Set();
    if (event.ctrlKey || command) desired.add('Control');
    if (event.altKey) desired.add('Alt');
    if (event.shiftKey) desired.add('Shift');
    for (const key of heldModifiers) if (!desired.has(key)) { send({ type: 'keyboard', key, action: 'up' }); heldModifiers.delete(key); }
    for (const key of desired) if (!heldModifiers.has(key)) { send({ type: 'keyboard', key, action: 'down' }); heldModifiers.add(key); }
  }
  const specialKeys = new Set(['Backspace', 'Delete', 'Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Insert']);
  keyboard.addEventListener('keydown', event => {
    if (!active || !nativeWidth || event.isComposing || composing || event.key === 'Dead' || event.key === 'Process') return;
    const command = event.metaKey && /^[acxv]$/i.test(event.key);
    if (event.metaKey && !command) return; // Keep VS Code/window shortcuts available.
    if ((event.ctrlKey || command) && !event.altKey && event.key.toLowerCase() === 'v') { releaseKeyboard(); return; } // paste event carries host clipboard text.
    if ((event.ctrlKey || command || (event.altKey && !event.getModifierState('AltGraph'))) && event.key.length === 1 || specialKeys.has(event.key) || /^F([1-9]|1[0-2])$/.test(event.key)) {
      event.preventDefault(); syncModifiers(event, command);
      send({ type: 'keyboard', key: event.key, action: 'press' });
    }
  });
  keyboard.addEventListener('keyup', event => {
    for (const [key, down] of [['Control', event.ctrlKey || event.metaKey], ['Shift', event.shiftKey], ['Alt', event.altKey]]) {
      if (!down && heldModifiers.delete(key)) send({ type: 'keyboard', key, action: 'up' });
    }
  });
  function commitText() {
    if (composing || !active || !nativeWidth || !keyboard.value) return;
    const text = keyboard.value; releaseKeyboard(); send({ type: 'text', text });
  }
  keyboard.addEventListener('input', event => { if (!event.isComposing) commitText(); });
  keyboard.addEventListener('compositionstart', () => { composing = true; });
  keyboard.addEventListener('compositionend', () => { composing = false; setTimeout(commitText, 0); });
  keyboard.addEventListener('paste', event => {
    if (!active || !nativeWidth) return;
    const text = event.clipboardData?.getData('text/plain');
    if (text) { event.preventDefault(); releaseKeyboard(); send({ type: 'paste', text }); }
  });
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
  let intervalWallStart = Date.now(), reportId = 0, latestReport;
  let lastDrawAt = 0, frameGap = 0;
  let noticeTimer, resizeTimer;
  const pointers = new Map();
  const moves = new Map();
  let moveTimer, nextMoveAt = 0, wheel = false, wheelGeneration = 0;
  let wheelPoint;
  let sourceFps = 0, frameFormat = 'rgba', channelName = 'bridge';
  let inputEvents = 0, animationTicks = 0, animationGap = 0, lastAnimation = 0, animationUntil = 0, animationRequest;
  function watchAnimation() {
    animationUntil = performance.now() + 1500;
    if (animationRequest) return;
    lastAnimation = 0;
    const tick = now => {
      animationTicks++;
      if (lastAnimation) animationGap = Math.max(animationGap, now - lastAnimation);
      lastAnimation = now;
      animationRequest = now < animationUntil && active ? requestAnimationFrame(tick) : undefined;
    };
    animationRequest = requestAnimationFrame(tick);
  }

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
          const finished = performance.now();
          if (lastDrawAt) frameGap = Math.max(frameGap, finished - lastDrawAt);
          lastDrawAt = finished;
          drawn++; decodeTotal += finished - started; ageTotal += Math.max(0, Date.now() - frame.arrivedAt);
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
        releaseKeyboard(); keyboard.blur();
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
    else if (message.type === 'pipeline' && latestReport && message.reportId === latestReport.reportId) {
      sourceFps = message.sourceFps; frameFormat = message.format; channelName = message.channel;
      showPerformance(latestReport, sourceFps);
    }
    else if (message.type === 'benchmark') { void benchmark(message.durationMs); }
    else if (message.type === 'reset') {
      releaseKeyboard(); keyboard.blur();
      releaseAll(); cancelWheel(); ++epoch;
      if (pending) send({ type: 'ack', id: pending.id });
      pending = undefined; nativeWidth = nativeHeight = 0;
      canvas.classList.remove('live'); empty.hidden = false; enabled(false);
      surface.style.width = surface.style.height = ''; fps.textContent = 'Idle';
      drawn = decodeTotal = ageTotal = 0; intervalStart = performance.now();
      intervalWallStart = Date.now(); latestReport = undefined; lastDrawAt = frameGap = 0;
    }
  });
  function showPerformance(report, source) {
    stats.textContent = report.fps ? `${report.fps.toFixed(0)} fps · source ${source === undefined ? '…' : source.toFixed(0)} · input ${report.inputFps.toFixed(0)} · browser ${report.rafFps.toFixed(0)} · ${frameFormat} · ${channelName} · draw ${report.decodeMs.toFixed(1)} ms · age ${report.ageMs.toFixed(0)} ms · gap ${report.frameMaxGapMs.toFixed(0)} ms · ${report.width}×${report.height}` : 'Idle · frames arrive when the screen changes';
  }
  setInterval(() => {
    if (!active) return;
    const now = performance.now();
    fps.textContent = drawn ? `${Math.round(drawn * 1000 / (now - intervalStart))} FPS` : 'Idle';
    const wallEnd = Date.now();
    latestReport = { type: 'performance', reportId: ++reportId, windowStart: intervalWallStart, windowEnd: wallEnd,
      fps: drawn * 1000 / (now - intervalStart), decodeMs: drawn ? decodeTotal / drawn : 0,
      ageMs: drawn ? ageTotal / drawn : 0, width: canvas.width, height: canvas.height,
      documentHidden: document.hidden ? 1 : 0, inputFps: inputEvents * 1000 / (now - intervalStart),
      rafFps: animationTicks * 1000 / (now - intervalStart), rafMaxGapMs: animationGap, frameMaxGapMs: frameGap };
    send(latestReport); showPerformance(latestReport);
    drawn = decodeTotal = ageTotal = 0; intervalStart = now;
    intervalWallStart = wallEnd; lastDrawAt = frameGap = 0;
    inputEvents = animationTicks = animationGap = 0;
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
  function pointer(action, id, p) { inputEvents++; watchAnimation(); send({ type: 'pointer', action, id, ...p }); }
  function flushMoves() {
    clearTimeout(moveTimer); moveTimer = undefined;
    for (const [id, p] of moves) pointer('move', id, p);
    moves.clear(); nextMoveAt = performance.now() + 1000 / 120;
  }
  canvas.addEventListener('pointerdown', event => {
    if (!active || !nativeWidth || event.button !== 0 || wheel) return;
    const used = [...pointers.values()].map(p => p.id);
    const id = Array.from({ length: 10 }, (_, i) => i).find(i => !used.includes(i));
    if (id === undefined) return;
    event.preventDefault(); canvas.focus(); canvas.setPointerCapture(event.pointerId);
    const p = point(event); pointers.set(event.pointerId, { id, ...p }); pointer('down', id, p);
  });
  function movePointer(event) {
    const previous = pointers.get(event.pointerId); if (!previous) return;
    const p = point(event); pointers.set(event.pointerId, { id: previous.id, ...p }); moves.set(previous.id, p);
    // Input must not wait for a VS Code compositor/rAF tick. Raw pointer events
    // preserve device cadence when Chromium coalesces pointermove to rendering.
    if (!moveTimer) moveTimer = setTimeout(flushMoves, Math.max(0, nextMoveAt - performance.now()));
  }
  canvas.addEventListener('pointermove', movePointer);
  canvas.addEventListener('pointerrawupdate', movePointer);
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
  window.addEventListener('blur', () => { releaseAll(); cancelWheel(); releaseKeyboard(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { releaseAll(); cancelWheel(); releaseKeyboard(); } else viewport(); });
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
        let tick = 0;
        while (epoch === generation && performance.now() - segment < 1000) {
          // Use the input clock, not compositor refresh, just like real raw
          // pointer delivery. Diagnostics separately measure browser rAF rate.
          await delay(Math.max(0, segment + ++tick * 1000 / 120 - performance.now()));
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
