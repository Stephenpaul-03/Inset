/* global acquireVsCodeApi */
(() => {
  'use strict';
  const vscode = acquireVsCodeApi();
  const $ = id => document.getElementById(id);
  const send = (type, data = {}) => vscode.postMessage({ type, ...data });
  const state = { tree: [], selection: null, connected: false, capabilities: {}, layout: null };
  const collapsed = new Set();
  let nodes = new Map(), visibleRows = [], selectedId, filter = '', initialized = false;
  const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  function button(text, action, className = '') { const node = element('button', className, text); node.type = 'button'; node.addEventListener('click', action); return node; }
  function showError(message) { $('error').textContent = message; $('error').hidden = !message; }
  for (const id of ['refresh', 'settings', 'disconnect']) $(id).addEventListener('click', () => send(id));
  $('connect').addEventListener('click', () => send('connect', { id: $('targets').value }));
  $('pick').addEventListener('click', () => send('pick'));
  $('reload-app').addEventListener('click', () => send('reloadApp'));
  $('reload-selection').addEventListener('click', () => send('refreshSelection'));
  $('source').addEventListener('click', () => send('source', { id: selectedId }));
  $('search').addEventListener('input', () => { filter = $('search').value.toLocaleLowerCase(); renderTree(); });
  $('collapse').addEventListener('click', () => { nodes.forEach(node => { if (node.children.length && node.parentID) collapsed.add(node.id); }); renderTree(); });
  function choose(id) { send('select', { id }); }
  function renderTree(reveal = false) {
    const scrollTop = $('tree').scrollTop;
    const matching = new Set();
    if (filter) nodes.forEach(node => {
      if (!node.name.toLocaleLowerCase().includes(filter)) return;
      let parent = node, seen = new Set();
      while (parent && !seen.has(parent.id)) { seen.add(parent.id); matching.add(parent.id); parent = nodes.get(parent.parentID); }
    });
    const fragment = document.createDocumentFragment(); visibleRows = [];
    const visited = new Set();
    const visit = (id, depth) => {
      const node = nodes.get(id); if (!node || visited.has(id) || (filter && !matching.has(id))) return;
      visited.add(id);
      if (node.type === 11) { node.children.forEach(child => visit(child, depth)); return; }
      const row = element('div', 'tree-row'); row.dataset.id = String(id); row.id = `component-${id}`;
      row.setAttribute('role', 'treeitem'); row.setAttribute('aria-level', String(depth + 1)); row.setAttribute('aria-selected', String(selectedId === id));
      if (node.children.length) row.setAttribute('aria-expanded', String(filter || !collapsed.has(id)));
      row.style.paddingLeft = `${depth * 14 + 4}px`;
      const toggle = button(node.children.length ? (collapsed.has(id) && !filter ? '›' : '⌄') : '', event => { event.stopPropagation(); if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id); renderTree(); }, 'twisty');
      toggle.tabIndex = -1; toggle.setAttribute('aria-label', `Toggle ${node.name}`); toggle.disabled = !node.children.length;
      row.append(toggle, element('span', 'node-name', node.name));
      if (node.key !== null) row.append(element('span', 'node-key', `key=${node.key}`));
      row.addEventListener('click', () => { $('tree').focus(); choose(id); });
      fragment.append(row); visibleRows.push(id);
      if (filter || !collapsed.has(id)) node.children.forEach(child => visit(child, depth + 1));
    };
    nodes.forEach(node => { if (!node.parentID || !nodes.has(node.parentID)) visit(node.id, 0); });
    $('tree').replaceChildren(fragment); $('tree').scrollTop = scrollTop;
    $('empty-tree').hidden = nodes.size > 0;
    $('count').textContent = `${state.tree.filter(node => node.type !== 11).length} components`;
    if (selectedId) $('tree').setAttribute('aria-activedescendant', `component-${selectedId}`);
    if (reveal) document.getElementById(`component-${selectedId}`)?.scrollIntoView({ block: 'nearest' });
  }
  $('tree').addEventListener('keydown', event => {
    if (!visibleRows.length) return;
    let index = visibleRows.indexOf(selectedId); if (index < 0) index = 0;
    const node = nodes.get(visibleRows[index]);
    if (event.key === 'ArrowDown') choose(visibleRows[Math.min(index + 1, visibleRows.length - 1)]);
    else if (event.key === 'ArrowUp') choose(visibleRows[Math.max(0, index - 1)]);
    else if (event.key === 'ArrowRight') { collapsed.delete(node.id); renderTree(); }
    else if (event.key === 'ArrowLeft') { if (!collapsed.has(node.id) && node.children.length) { collapsed.add(node.id); renderTree(); } else if (nodes.get(node.parentID)?.type !== 11) choose(node.parentID); }
    else return;
    event.preventDefault();
  });
  function preview(value) {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'object') return Array.isArray(value) ? `Array(${value.length})` : '{…}';
    const text = typeof value === 'string' ? JSON.stringify(value) : String(value);
    return text.length > 250 ? `${text.slice(0, 250)}…` : text;
  }
  function placeholder(envelope, path) {
    return [...(envelope?.cleaned || []), ...(envelope?.unserializable || [])].some(parts => JSON.stringify(parts) === JSON.stringify(path));
  }
  function editor(parent, value, section, path, hookID) {
    parent.querySelector('.value-editor')?.remove();
    const form = element('form', 'value-editor'); const input = element('textarea');
    input.setAttribute('aria-label', `JSON value for ${path.join('.') || 'hook value'}`); input.value = JSON.stringify(value, null, 2) ?? 'null';
    const validation = element('span', 'validation'); validation.setAttribute('role', 'alert');
    const apply = element('button', '', 'Apply'); apply.type = 'submit';
    form.append(input, apply, button('Cancel', () => { form.remove(); renderDetails(); }), validation);
    form.addEventListener('submit', event => {
      event.preventDefault();
      try { JSON.parse(input.value); send('edit', { id: selectedId, section, path, json: input.value, hookID }); form.remove(); renderDetails(); }
      catch { validation.textContent = 'Enter a valid JSON value.'; }
    });
    parent.append(form); input.focus(); input.select();
  }
  function renderValue(parent, key, value, options, depth = 0) {
    const { envelope, path, section, canEdit, hookID, hydratePath } = options;
    const property = element('div', 'property'); const line = element('div', 'property-line');
    line.append(element('span', 'property-label', `${key}:`));
    const dehydrated = placeholder(envelope, hydratePath || path);
    if (dehydrated) {
      line.append(element('span', 'muted', value?.preview_short || value?.name || value?.type || '…'));
      if (section !== 'style') line.append(button('Expand', () => send('hydrate', { id: selectedId, path: [section, ...(hydratePath || path)] })));
    } else {
      line.append(element('span', 'property-value', preview(value)));
      if (canEdit && value !== undefined && (section !== 'style' || path.length === 1) && (value === null || typeof value !== 'object' || section === 'style')) line.append(button('Edit', () => editor(property, value, section, path, hookID), 'edit'));
    }
    property.append(line); parent.append(property);
    if (!dehydrated && value && typeof value === 'object' && depth < 12) {
      const children = element('div', 'children');
      for (const [child, item] of Object.entries(value).slice(0, 250)) renderValue(children, child, item, { ...options, path: [...path, Array.isArray(value) ? Number(child) : child], hydratePath: hydratePath ? [...hydratePath, Array.isArray(value) ? Number(child) : child] : undefined }, depth + 1);
      if (Object.keys(value).length > 250) children.append(element('p', 'muted', 'First 250 entries shown.'));
      property.append(children);
    }
  }
  function renderSection(id, envelope, canEdit) {
    const parent = $(id); parent.replaceChildren();
    if (!envelope?.data || typeof envelope.data !== 'object') { parent.append(element('p', 'muted', 'None')); return; }
    for (const [key, value] of Object.entries(envelope.data)) renderValue(parent, key, value, { envelope, path: [Array.isArray(envelope.data) ? Number(key) : key], section: id, canEdit });
  }
  function renderHooks(envelope) {
    $('hooks').replaceChildren();
    const visit = (hooks, base = []) => {
      if (!Array.isArray(hooks)) return;
      hooks.forEach((hook, index) => {
        const hookPath = [...base, index];
        const group = element('div', 'hook');
        if (placeholder(envelope, hookPath)) { renderValue(group, 'Hook', hook, { envelope, path: hookPath, section: 'hooks', canEdit: false }); }
        else {
          group.append(element('strong', '', `${hook.name || 'Hook'}${hook.id === null || hook.id === undefined ? '' : ` #${hook.id}`}`));
          renderValue(group, 'value', hook.value, { envelope, path: [], hydratePath: [...hookPath, 'value'], section: 'hooks', canEdit: state.selection?.value?.canEditHooks && hook.isStateEditable && Number.isSafeInteger(hook.id), hookID: hook.id });
          if (placeholder(envelope, [...hookPath, 'subHooks'])) renderValue(group, 'subHooks', hook.subHooks, { envelope, path: [...hookPath, 'subHooks'], section: 'hooks', canEdit: false });
          else visit(hook.subHooks, [...hookPath, 'subHooks']);
        }
        $('hooks').append(group);
      });
    };
    visit(envelope?.data);
    if (!$('hooks').children.length) $('hooks').append(element('p', 'muted', 'No hooks.'));
  }
  function renderDetails() {
    const selection = state.selection;
    if (selectedId === selection?.node?.id && document.querySelector('.value-editor')) return;
    selectedId = selection?.node?.id;
    $('name').textContent = selection?.node?.name || 'Select a component';
    $('source').disabled = !selectedId || !state.connected; $('reload-selection').disabled = !selectedId || !state.connected;
    $('details').hidden = !selection?.value;
    $('selection-hint').hidden = !!selection?.value;
    $('selection-hint').textContent = selectedId ? 'Reading component…' : 'Choose a component in the tree, or use Pick and click the emulator.';
    $('ancestors').replaceChildren();
    if (!selectedId) { renderTree(); return; }
    let parent = nodes.get(selection.node.parentID), seen = new Set(); const ancestors = [];
    while (parent && !seen.has(parent.id)) { seen.add(parent.id); if (parent.type !== 11) ancestors.unshift(parent); collapsed.delete(parent.id); parent = nodes.get(parent.parentID); }
    for (const ancestor of ancestors) $('ancestors').append(button(`${ancestor.name} ›`, () => choose(ancestor.id)));
    renderTree(true);
    const value = selection.value; if (!value) return;
    renderSection('props', value.props, value.canEditFunctionProps || value.type === 1 || value.type === 7);
    renderSection('state', value.state, value.type === 1);
    renderSection('context', value.context, false);
    renderHooks(value.hooks); renderLayout();
  }
  function renderLayout() {
    if ($('style').querySelector('.value-editor')) return;
    $('layout').replaceChildren(); $('style').replaceChildren();
    const layout = state.layout?.layout;
    if (layout) {
      const grid = element('div', 'layout-grid');
      for (const key of ['width', 'height', 'left', 'top']) {
        const measure = element('div', 'measurement'); measure.append(element('span', '', key), element('strong', '', Number.isFinite(layout[key]) ? String(Math.round(layout[key] * 10) / 10) : '—')); grid.append(measure);
      }
      $('layout').append(grid);
      for (const key of ['padding', 'margin']) if (layout[key]) renderValue($('layout'), key, layout[key], { path: [key], section: 'layout', canEdit: false });
    } else $('layout').append(element('p', 'muted', 'Native layout is available for measurable components with styles. Select a View or Text child if this component has no native layout.'));
    const style = state.layout?.style;
    if (style) for (const [key, value] of Object.entries(style)) renderValue($('style'), key, value, { path: [key], section: 'style', canEdit: !!state.capabilities.nativeStyle });
    $('add-style').hidden = !state.capabilities.nativeStyle || !style;
  }
  $('add-style').addEventListener('submit', event => {
    event.preventDefault();
    try { JSON.parse($('style-value').value); send('edit', { id: selectedId, section: 'style', path: [$('style-name').value.trim()], json: $('style-value').value }); }
    catch { showError('Enter a valid JSON style value, such as 12 or "red".'); }
  });
  window.addEventListener('message', event => {
    const message = event.data; if (!message || typeof message !== 'object') return;
    if (message.type === 'hydrated' && message.id === selectedId) {
      const [section, ...path] = message.path || []; const envelope = state.selection?.value?.[section]; if (!envelope) return;
      let parent = envelope.data; for (const key of path.slice(0, -1)) parent = parent?.[key];
      if (parent && path.length) parent[path[path.length - 1]] = message.value.data;
      else if (!path.length) envelope.data = message.value.data;
      envelope.cleaned = (envelope.cleaned || []).filter(parts => JSON.stringify(parts) !== JSON.stringify(path));
      envelope.unserializable = (envelope.unserializable || []).filter(parts => JSON.stringify(parts) !== JSON.stringify(path));
      for (const kind of ['cleaned', 'unserializable']) envelope[kind].push(...(message.value[kind] || []).map(parts => [...path, ...parts]));
      renderDetails(); return;
    }
    if (message.type !== 'update') return;
    Object.assign(state, message);
    if (message.targets) {
      const previous = $('targets').value; $('targets').replaceChildren();
      if (!message.targets.length) { const option = element('option', '', 'No running apps'); option.value = ''; $('targets').append(option); }
      for (const target of message.targets) { const option = element('option', '', `${target.title}${target.deviceName ? ` · ${target.deviceName}` : ''}`); option.value = target.id; $('targets').append(option); }
      if (message.targets.some(target => target.id === previous)) $('targets').value = previous;
    }
    if (message.targetId) $('targets').value = message.targetId;
    $('connect').disabled = !!state.connecting || !$('targets').value; $('disconnect').disabled = !state.connected && !state.connecting;
    $('pick').disabled = !state.connected; $('pick').setAttribute('aria-pressed', String(!!state.picking)); $('pick').textContent = state.picking ? 'Picking…' : 'Pick';
    $('reload-app').disabled = !state.connected;
    $('connection').className = state.connected ? 'dot connected' : 'dot';
    if (message.status !== undefined) $('status').textContent = message.status;
    if (message.version !== undefined) $('version').textContent = message.version;
    if (message.error !== undefined) showError(message.error);
    if (message.tree) {
      nodes = new Map(message.tree.map(node => [node.id, node]));
      if (!initialized && nodes.size) {
        initialized = true;
        nodes.forEach(node => { let depth = 0, parent = node; const seen = new Set(); while (parent && !seen.has(parent.id)) { seen.add(parent.id); depth++; parent = nodes.get(parent.parentID); } if (depth > 9) collapsed.add(node.id); });
      }
      if (!nodes.size) { initialized = false; collapsed.clear(); }
      renderTree();
    }
    if ('selection' in message) renderDetails();
    else if ('layout' in message || 'capabilities' in message) renderLayout();
  });
  send('ready');
})();
