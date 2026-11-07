export interface ComponentNode {
  id: number; rendererID: number; parentID: number; name: string; key: string | null; type: number; children: number[];
}

// React DevTools bridge operations, not a walk of private React Fiber fields.
// Parse into a copy so an unsupported operation cannot leave a half-applied tree.
export class ComponentTree {
  nodes = new Map<number, ComponentNode>();
  apply(operations: number[]): void {
    if (!Array.isArray(operations) || operations.length < 3 || operations.length > 2_000_000 || !operations.every(Number.isSafeInteger)) throw new Error('Invalid component tree message.');
    const [rendererID, rootID, stringLength] = operations;
    let i = 3;
    const end = i + stringLength;
    const strings: (string | null)[] = [null];
    if (stringLength < 0 || end > operations.length) throw new Error('Invalid component names.');
    while (i < end) {
      const length = operations[i++];
      if (length < 0 || i + length > end) throw new Error('Invalid component name length.');
      let name = '';
      for (let j = 0; j < length; j++) name += String.fromCodePoint(operations[i++]);
      strings.push(name);
    }
    const nodes = new Map([...this.nodes].map(([id, node]) => [id, { ...node, children: [...node.children] }]));
    const take = () => { if (i >= operations.length) throw new Error('Truncated component operation.'); return operations[i++]; };
    const remove = (id: number): void => {
      const node = nodes.get(id); if (!node) return;
      for (const child of node.children) remove(child);
      const parent = nodes.get(node.parentID);
      if (parent) parent.children = parent.children.filter(child => child !== id);
      nodes.delete(id);
    };
    while (i < operations.length) {
      const operation = take();
      if (operation === 1) {
        const id = take(), type = take();
        let parentID = 0, name = 'Root', key: string | null = null;
        if (type === 11) { take(); take(); take(); take(); }
        else { parentID = take(); take(); const nameID = take(), keyID = take();
          if (nameID >= strings.length || keyID >= strings.length || nameID < 0 || keyID < 0) throw new Error('Invalid component string reference.');
          name = strings[nameID] || 'Anonymous'; key = strings[keyID];
        }
        if (nodes.has(id)) throw new Error('Duplicate component ID.');
        nodes.set(id, { id, type, parentID, rendererID, name, key, children: [] });
        const parent = nodes.get(parentID);
        if (parent) parent.children.push(id);
      } else if (operation === 2) {
        const count = take(); if (count < 0 || i + count > operations.length) throw new Error('Invalid component removal.');
        for (let j = 0; j < count; j++) remove(take());
      } else if (operation === 3) {
        const id = take(), count = take();
        if (count < 0 || i + count > operations.length) throw new Error('Invalid component ordering.');
        const children = operations.slice(i, i + count); i += count;
        const parent = nodes.get(id); if (parent) parent.children = children;
      } else if (operation === 4 || operation === 7) { take(); take(); }
      else if (operation === 5) { take(); take(); take(); }
      else if (operation === 6) remove(rootID);
      else throw new Error(`Unsupported React DevTools tree operation ${operation}. This React Native version needs an updated Inset adapter.`);
    }
    this.nodes = nodes;
  }
  clear(): void { this.nodes.clear(); }
  snapshot(): ComponentNode[] { return [...this.nodes.values()]; }
}
