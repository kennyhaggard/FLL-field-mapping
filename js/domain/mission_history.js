// Session-only history: no browser storage or field-preview side effects.
export function createMissionHistory(limit = 100) {
  const past = [];
  const future = [];
  let lastGroup = null;
  const clone = value => JSON.parse(JSON.stringify(value));
  return {
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    endGroup() { lastGroup = null; },
    clear() { past.length = 0; future.length = 0; lastGroup = null; },
    record(before, after, group = null) {
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      if (!group || group !== lastGroup) past.push(clone(before));
      if (past.length > limit) past.shift();
      future.length = 0;
      lastGroup = group;
    },
    undo(current) {
      lastGroup = null;
      if (!past.length) return null;
      future.push(clone(current));
      return past.pop();
    },
    redo(current) {
      lastGroup = null;
      if (!future.length) return null;
      past.push(clone(current));
      return future.pop();
    }
  };
}
