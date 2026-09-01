(function blocksLogicModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BlocksLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createBlocksLogic() {
  "use strict";

  const MIN_N = 2;
  const MAX_N = 8;
  const MAX_H = 10;

  const clampN = (value) => Math.max(MIN_N, Math.min(MAX_N, Math.round(Number(value) || 0)));

  const inside = (state, row, col) => (
    Number.isInteger(row)
    && Number.isInteger(col)
    && row >= 0
    && row < state.rows
    && col >= 0
    && col < state.cols
  );

  const heightAt = (state, row, col) => (inside(state, row, col) ? state.h[row * state.cols + col] : 0);

  const cloneState = (state) => ({ cols: state.cols, rows: state.rows, h: state.h.slice() });

  const stairHeight = (rows, cols, row, col) => Math.max(0, Math.min(MAX_H, Math.min(cols - col, rows - row)));

  function createState(cols = 3, rows = 3) {
    const safeCols = clampN(cols);
    const safeRows = clampN(rows);
    const h = [];
    for (let row = 0; row < safeRows; row += 1) {
      for (let col = 0; col < safeCols; col += 1) h.push(stairHeight(safeRows, safeCols, row, col));
    }
    return { cols: safeCols, rows: safeRows, h };
  }

  function withHeight(state, row, col, value) {
    if (!inside(state, row, col)) return state;
    const nextValue = Math.max(0, Math.min(MAX_H, Math.round(Number(value) || 0)));
    const index = row * state.cols + col;
    if (state.h[index] === nextValue) return state;
    const h = state.h.slice();
    h[index] = nextValue;
    return { ...state, h };
  }

  const add = (state, row, col) => {
    const current = heightAt(state, row, col);
    return current >= MAX_H ? state : withHeight(state, row, col, current + 1);
  };

  const take = (state, row, col) => {
    const current = heightAt(state, row, col);
    return current <= 0 ? state : withHeight(state, row, col, current - 1);
  };

  function move(state, from, to) {
    if (!from || !to || !inside(state, from.r, from.c) || !inside(state, to.r, to.c)) return state;
    if (from.r === to.r && from.c === to.c) return state;
    const source = heightAt(state, from.r, from.c);
    const target = heightAt(state, to.r, to.c);
    if (source <= 0 || target >= MAX_H) return state;
    let next = withHeight(state, from.r, from.c, source - 1);
    next = withHeight(next, to.r, to.c, target + 1);
    return next;
  }

  function resize(state, cols, rows) {
    const safeCols = clampN(cols);
    const safeRows = clampN(rows);
    if (safeCols === state.cols && safeRows === state.rows) return state;
    const h = [];
    for (let row = 0; row < safeRows; row += 1) {
      for (let col = 0; col < safeCols; col += 1) h.push(heightAt(state, row, col));
    }
    return { cols: safeCols, rows: safeRows, h };
  }

  function clear(state) {
    if (state.h.every((height) => height === 0)) return state;
    return { ...state, h: state.h.map(() => 0) };
  }

  function viewsOf(state) {
    const top = [];
    const rowMax = [];
    const front = new Array(state.cols).fill(0);
    let total = 0;
    let layers = 0;
    let filled = 0;

    for (let row = 0; row < state.rows; row += 1) {
      const line = [];
      let rowHeight = 0;
      for (let col = 0; col < state.cols; col += 1) {
        const height = heightAt(state, row, col);
        line.push(height);
        total += height;
        if (height > 0) filled += 1;
        if (height > rowHeight) rowHeight = height;
        if (height > front[col]) front[col] = height;
        if (height > layers) layers = height;
      }
      top.push(line);
      rowMax.push(rowHeight);
    }

    return {
      top,
      front,
      // 오른쪽 옆에서 보면 앞 줄(row = rows - 1)이 왼쪽에 온다.
      side: rowMax.slice().reverse(),
      rowMax,
      total,
      layers,
      filled,
    };
  }

  return {
    MIN_N,
    MAX_N,
    MAX_H,
    clampN,
    inside,
    heightAt,
    cloneState,
    stairHeight,
    createState,
    withHeight,
    add,
    take,
    move,
    resize,
    clear,
    viewsOf,
  };
});
