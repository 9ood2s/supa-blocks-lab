(function blocksInteractionModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BlocksInteraction = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createBlocksInteraction() {
  "use strict";

  const MOTION_MS = 360;

  function motionIsActive(started, now, duration = MOTION_MS) {
    if (!Number.isFinite(started) || !Number.isFinite(now) || duration <= 0) return false;
    return now - started < duration;
  }

  function pointIsInsideCanvas(point, width, height) {
    return !!point
      && Number.isFinite(point.x)
      && Number.isFinite(point.y)
      && point.x >= 0
      && point.y >= 0
      && point.x <= width
      && point.y <= height;
  }

  const sameCell = (a, b) => !!a && !!b && a.r === b.r && a.c === b.c;

  /**
   * 드롭 결과를 화면 좌표와 셀 판정에서 분리한다.
   * 작업대 안의 빈 여백은 취소이고, 실제 캔버스 밖으로 나간 경우만 remove다.
   */
  function resolveDragDrop({ point, width, height, dynamicCell, sourceCell, overOriginalSource }) {
    if (!pointIsInsideCanvas(point, width, height)) return { kind: "remove", cell: null };
    const cell = dynamicCell || (overOriginalSource ? sourceCell : null);
    if (!cell) return { kind: "cancel", cell: null };
    if (sameCell(cell, sourceCell)) return { kind: "same", cell };
    return { kind: "move", cell };
  }

  return {
    MOTION_MS,
    motionIsActive,
    pointIsInsideCanvas,
    resolveDragDrop,
  };
});
