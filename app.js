(function blocksPrototypeApp() {
  "use strict";

  const logic = window.BlocksLogic;
  const interaction = window.BlocksInteraction;
  if (!logic) throw new Error("BlocksLogic을 불러오지 못했습니다.");
  if (!interaction) throw new Error("BlocksInteraction을 불러오지 못했습니다.");

  const {
    MIN_N,
    MAX_N,
    MAX_H,
    createState,
    cloneState,
    heightAt,
    add,
    take,
    move,
    resize,
    clear,
    viewsOf,
  } = logic;
  const { MOTION_MS, motionIsActive, resolveDragDrop } = interaction;

  const COLORS = {
    ink: "#38261f",
    ivory: "#fff1cf",
    paper: "#fff9e8",
    teal: "#176b78",
    tealDark: "#0d3f48",
    red: "#e94f3d",
    redDark: "#aa332d",
    gold: "#efb83f",
    jade: "#6fbf9e",
    purple: "#6c3f77",
    board: "#eadfbd",
    empty: "#f8f0da",
    woodTop: "#dfb768",
    woodLeft: "#9b682d",
    woodRight: "#c48b43",
    woodEdge: "#76502b",
  };

  const canvas = document.querySelector("#blocksCanvas");
  const canvasWrap = document.querySelector("#canvasWrap");
  const context = canvas.getContext("2d");
  const totalCount = document.querySelector("#totalCount");
  const layerCount = document.querySelector("#layerCount");
  const boardCount = document.querySelector("#boardCount");
  const undoButton = document.querySelector("#undoButton");
  const redoButton = document.querySelector("#redoButton");
  const resetButton = document.querySelector("#resetButton");
  const clearButton = document.querySelector("#clearButton");
  const sizeButton = document.querySelector("#sizeButton");
  const sizePicker = document.querySelector("#sizePicker");
  const colsPicker = document.querySelector("#colsPicker");
  const rowsPicker = document.querySelector("#rowsPicker");
  const topProjection = document.querySelector("#topProjection");
  const frontProjection = document.querySelector("#frontProjection");
  const sideProjection = document.querySelector("#sideProjection");
  const status = document.querySelector("#status");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let state = createState();
  let tool = "add";
  let past = [];
  let future = [];
  let hover = null;
  let layout = null;
  let hitShapes = [];
  let stackFacePolygons = [];
  let drawFrame = 0;
  let motion = null;
  let drag = null;
  let orbit = null;
  let pointerDown = null;
  let renderedFrames = 0;
  const DEFAULT_CAMERA = { yaw: Math.PI / 4, pitch: .56 };
  const MIN_CAMERA_PITCH = 8 * Math.PI / 180;
  const MAX_CAMERA_PITCH = 84 * Math.PI / 180;
  const MIN_VIEW_FIT_HEIGHT = 4;
  const camera = { ...DEFAULT_CAMERA };
  let viewFitHeight = Math.max(MIN_VIEW_FIT_HEIGHT, ...state.h);

  const sameCell = (a, b) => !!a && !!b && a.r === b.r && a.c === b.c;
  const cellName = (cell) => `${state.rows - cell.r}번째 앞줄 · ${cell.c + 1}번째 칸`;

  function announce(message) {
    status.textContent = "";
    window.setTimeout(() => { status.textContent = message; }, 20);
  }

  function commit(next, message, changedCell, motionType) {
    if (next === state) {
      if (message) announce(message);
      return false;
    }
    past.push(cloneState(state));
    if (past.length > 100) past.shift();
    future = [];
    state = next;
    // 쌓고 지울 때 판이 확대·축소되지 않도록 화면 맞춤 높이는 유지한다.
    // 판 크기를 직접 바꾼 경우에만 새 판을 담는 고정 기준을 다시 잡는다.
    if (motionType === "resize") viewFitHeight = Math.max(MIN_VIEW_FIT_HEIGHT, ...state.h);
    if (changedCell && !reducedMotion.matches) motion = { cell: { ...changedCell }, type: motionType || "add", started: performance.now() };
    renderState();
    if (message) announce(message);
    return true;
  }

  function undo() {
    if (!past.length) return;
    future.push(cloneState(state));
    state = past.pop();
    motion = null;
    renderState();
    announce("바로 전 모습으로 돌아갔어요.");
  }

  function redo() {
    if (!future.length) return;
    past.push(cloneState(state));
    state = future.pop();
    motion = null;
    renderState();
    announce("다시 바꾼 모습을 불러왔어요.");
  }

  function createNumberPicker(root, axis) {
    for (let value = MIN_N; value <= MAX_N; value += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.axis = axis;
      button.dataset.value = String(value);
      button.textContent = String(value);
      button.setAttribute("aria-label", `${axis === "cols" ? "가로" : "깊이"} ${value}칸`);
      button.addEventListener("click", () => {
        const next = axis === "cols" ? resize(state, value, state.rows) : resize(state, state.cols, value);
        const label = axis === "cols" ? `가로를 ${value}칸으로 바꿨어요.` : `깊이를 ${value}칸으로 바꿨어요.`;
        commit(next, label, null, "resize");
      });
      root.append(button);
    }
  }

  createNumberPicker(colsPicker, "cols");
  createNumberPicker(rowsPicker, "rows");

  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      tool = button.dataset.tool;
      document.querySelectorAll("[data-tool]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      announce(tool === "add" ? "쌓기 도구를 들었어요." : "지우기 도구를 들었어요.");
    });
  });

  sizeButton.addEventListener("click", () => {
    const open = sizePicker.hidden;
    sizePicker.hidden = !open;
    sizeButton.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("pointerdown", (event) => {
    if (sizePicker.hidden || sizePicker.contains(event.target) || sizeButton.contains(event.target)) return;
    sizePicker.hidden = true;
    sizeButton.setAttribute("aria-expanded", "false");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !sizePicker.hidden) {
      sizePicker.hidden = true;
      sizeButton.setAttribute("aria-expanded", "false");
      sizeButton.focus();
    }
  });

  undoButton.addEventListener("click", undo);
  redoButton.addEventListener("click", redo);
  resetButton.addEventListener("click", () => {
    state = createState();
    viewFitHeight = Math.max(MIN_VIEW_FIT_HEIGHT, ...state.h);
    past = [];
    future = [];
    hover = null;
    motion = null;
    renderState();
    announce("처음 3 × 3 계단 모양으로 돌아왔어요.");
  });
  clearButton.addEventListener("click", () => commit(clear(state), "판을 비웠어요. 되돌리기로 다시 가져올 수 있어요.", null, "clear"));

  function renderState() {
    const solved = viewsOf(state);
    totalCount.textContent = String(solved.total);
    layerCount.textContent = String(solved.layers);
    boardCount.textContent = `${state.cols} × ${state.rows}`;
    undoButton.disabled = past.length === 0;
    redoButton.disabled = future.length === 0;
    updateSizePicker();
    renderProjections(solved);
    // 판 크기나 최고 층이 바뀌면 캔버스 자체의 CSS 크기가 같아도 담는 비율을 다시 계산해야 한다.
    resizeCanvas();
  }

  function updateSizePicker() {
    document.querySelectorAll(".number-pills button").forEach((button) => {
      const current = button.dataset.axis === "cols" ? state.cols : state.rows;
      const selected = Number(button.dataset.value) === current;
      button.classList.toggle("is-current", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function renderProjections(solved) {
    topProjection.replaceChildren();
    const topPlane = makeProjectionPlane(state.cols, state.rows, "top");
    topPlane.style.gridTemplateRows = `repeat(${state.rows}, minmax(0, 1fr))`;
    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        const value = solved.top[row][col];
        const cell = document.createElement("div");
        cell.className = `top-cell${value > 0 ? " is-filled" : ""}`;
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.textContent = value > 0 ? String(value) : "";
        cell.setAttribute("aria-label", `${cellName({ r: row, c: col })}, ${value}개`);
        cell.addEventListener("pointerenter", () => setHover({ r: row, c: col }));
        cell.addEventListener("pointerleave", () => setHover(null));
        topPlane.append(cell);
      }
    }
    topProjection.append(topPlane);

    renderElevation(frontProjection, solved.front, "front");
    renderElevation(sideProjection, solved.side, "side");
    updateProjectionHighlights();
  }

  function makeProjectionPlane(cols, rows, kind) {
    const plane = document.createElement("div");
    plane.className = `projection-plane projection-plane--${kind} ${cols >= rows ? "is-wide" : "is-tall"}`;
    plane.style.aspectRatio = `${Math.max(1, cols)} / ${Math.max(1, rows)}`;
    plane.style.gridTemplateColumns = `repeat(${Math.max(1, cols)}, minmax(0, 1fr))`;
    return plane;
  }

  function renderElevation(root, values, kind) {
    root.replaceChildren();
    const visibleLevels = Math.max(1, ...values);
    const plane = makeProjectionPlane(values.length, visibleLevels, "elevation");
    values.forEach((height, slot) => {
      const column = document.createElement("div");
      column.className = "projection-column";
      column.style.gridTemplateRows = `repeat(${visibleLevels}, minmax(0, 1fr))`;
      column.dataset.kind = kind;
      column.dataset.slot = String(slot);
      column.setAttribute("aria-label", `${slot + 1}번째 자리 ${height}층`);
      for (let level = visibleLevels; level >= 1; level -= 1) {
        const unit = document.createElement("i");
        unit.className = `projection-unit${level <= height ? " is-filled" : ""}`;
        column.append(unit);
      }
      plane.append(column);
    });
    root.append(plane);
  }

  function setHover(next) {
    if (sameCell(hover, next) || (!hover && !next)) return;
    hover = next;
    updateProjectionHighlights();
    requestDraw();
  }

  function updateProjectionHighlights() {
    document.querySelectorAll(".is-linked").forEach((element) => element.classList.remove("is-linked"));
    if (!hover) return;
    topProjection.querySelector(`[data-row="${hover.r}"][data-col="${hover.c}"]`)?.classList.add("is-linked");
    frontProjection.querySelector(`[data-slot="${hover.c}"]`)?.classList.add("is-linked");
    sideProjection.querySelector(`[data-slot="${state.rows - 1 - hover.r}"]`)?.classList.add("is-linked");
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
    const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout = computeLayout(rect.width, rect.height);
    requestDraw();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function maxPitchProjection(sinCoefficient, cosCoefficient) {
    const peakPitch = clamp(
      Math.atan2(sinCoefficient, cosCoefficient),
      MIN_CAMERA_PITCH,
      MAX_CAMERA_PITCH,
    );
    return sinCoefficient * Math.sin(peakPitch) + cosCoefficient * Math.cos(peakPitch);
  }

  function computeLayout(width, height) {
    const basis = cameraBasis();
    // 회전할 때마다 현재 투영 경계에 맞춰 확대·이동하면 판까지 움직이는 것처럼 보인다.
    // 모든 허용 시점을 감싸는 고정 경계를 한 번의 식으로 사용해 판의 중심과 칸 크기를 유지한다.
    const boardRadius = Math.hypot(state.cols / 2, state.rows / 2);
    const boardThickness = .14;
    const upperExtent = maxPitchProjection(boardRadius, viewFitHeight);
    const lowerExtent = maxPitchProjection(boardRadius, boardThickness);
    const sidePadding = Math.max(48, Math.min(72, width * .08));
    const topPadding = Math.max(38, Math.min(52, height * .085));
    const bottomPadding = topPadding;
    const usableWidth = Math.max(120, width - sidePadding * 2);
    const usableHeight = Math.max(120, height - topPadding - bottomPadding);
    const fullWidth = Math.max(1, boardRadius * 2);
    const fullHeight = Math.max(1, upperExtent + lowerExtent);
    const scale = Math.min(132, usableWidth / fullWidth, usableHeight / fullHeight);
    const remainingHeight = usableHeight - fullHeight * scale;
    return {
      width,
      height,
      basis,
      scale,
      originX: width / 2,
      originY: topPadding + upperExtent * scale + remainingHeight / 2,
    };
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function cameraBasis() {
    const sinYaw = Math.sin(camera.yaw);
    const cosYaw = Math.cos(camera.yaw);
    const sinPitch = Math.sin(camera.pitch);
    const cosPitch = Math.cos(camera.pitch);
    return {
      view: { x: sinYaw * cosPitch, y: sinPitch, z: cosYaw * cosPitch },
      right: { x: cosYaw, y: 0, z: -sinYaw },
      up: { x: -sinYaw * sinPitch, y: cosPitch, z: -cosYaw * sinPitch },
    };
  }

  function rawProject(point, basis = layout?.basis || cameraBasis()) {
    return {
      x: dot(point, basis.right),
      y: -dot(point, basis.up),
      depth: dot(point, basis.view),
    };
  }

  function projectPoint(point) {
    const projected = rawProject(point, layout.basis);
    return {
      x: layout.originX + projected.x * layout.scale,
      y: layout.originY + projected.y * layout.scale,
      depth: projected.depth,
    };
  }

  function cellWorld(row, col, y = 0) {
    return {
      x: col - (state.cols - 1) / 2,
      y,
      z: row - (state.rows - 1) / 2,
    };
  }

  function effectiveHeight(row, col) {
    if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) return 0;
    const heldBack = drag?.active && sameCell(drag.from, { r: row, c: col }) ? 1 : 0;
    return Math.max(0, heightAt(state, row, col) - heldBack);
  }

  const FACE_NORMALS = {
    top: { x: 0, y: 1, z: 0 },
    xp: { x: 1, y: 0, z: 0 },
    xn: { x: -1, y: 0, z: 0 },
    zp: { x: 0, y: 0, z: 1 },
    zn: { x: 0, y: 0, z: -1 },
  };

  function faceCorners(kind, box) {
    const { x0, x1, y0, y1, z0, z1 } = box;
    if (kind === "top") return [
      { x: x0, y: y1, z: z0 }, { x: x1, y: y1, z: z0 },
      { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 },
    ];
    if (kind === "xp") return [
      { x: x1, y: y1, z: z1 }, { x: x1, y: y1, z: z0 },
      { x: x1, y: y0, z: z0 }, { x: x1, y: y0, z: z1 },
    ];
    if (kind === "xn") return [
      { x: x0, y: y1, z: z0 }, { x: x0, y: y1, z: z1 },
      { x: x0, y: y0, z: z1 }, { x: x0, y: y0, z: z0 },
    ];
    if (kind === "zp") return [
      { x: x0, y: y1, z: z1 }, { x: x1, y: y1, z: z1 },
      { x: x1, y: y0, z: z1 }, { x: x0, y: y0, z: z1 },
    ];
    return [
      { x: x1, y: y1, z: z0 }, { x: x0, y: y1, z: z0 },
      { x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 },
    ];
  }

  function projectedFace(kind, box, liftY = 0) {
    const points = faceCorners(kind, box).map((point) => (
      liftY ? { ...point, y: point.y + liftY } : point
    ));
    const projected = points.map(projectPoint);
    return {
      kind,
      normal: FACE_NORMALS[kind],
      polygon: projected,
      depth: points.reduce((sum, point) => sum + dot(point, layout.basis.view), 0) / points.length,
    };
  }

  function faceIsVisible(kind) {
    return dot(FACE_NORMALS[kind], layout.basis.view) > 1e-6;
  }

  function topPolygon(row, col, height = 0) {
    const center = cellWorld(row, col, height);
    return faceCorners("top", {
      x0: center.x - .5, x1: center.x + .5,
      y0: height, y1: height,
      z0: center.z - .5, z1: center.z + .5,
    }).map(projectPoint);
  }

  function pathPolygon(points) {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
    context.closePath();
  }

  function fillStroke(points, fill, stroke = COLORS.ink, width = 2) {
    pathPolygon(points);
    context.fillStyle = fill;
    context.fill();
    context.lineWidth = width;
    context.strokeStyle = stroke;
    context.lineJoin = "round";
    context.stroke();
  }

  function pointInPolygon(point, polygon) {
    let insideShape = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const a = polygon[i];
      const b = polygon[j];
      const crossed = ((a.y > point.y) !== (b.y > point.y))
        && (point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1e-9) + a.x);
      if (crossed) insideShape = !insideShape;
    }
    return insideShape;
  }

  function hitCell(point) {
    for (let index = hitShapes.length - 1; index >= 0; index -= 1) {
      const item = hitShapes[index];
      if (pointInPolygon(point, item.polygon)) return { ...item.cell };
    }
    return null;
  }

  function drawRoundedPill(x, y, text, fill, color, alpha = 1) {
    context.save();
    context.globalAlpha = alpha;
    context.font = "900 11px system-ui, sans-serif";
    const { width, height } = pillMetrics(text);
    context.beginPath();
    context.roundRect(x - width / 2, y - height / 2, width, height, 999);
    context.fillStyle = fill;
    context.fill();
    context.lineWidth = 2.5;
    context.strokeStyle = COLORS.ink;
    context.stroke();
    context.fillStyle = color;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, x, y + .5);
    context.restore();
  }

  function pillMetrics(text) {
    context.save();
    context.font = "900 11px system-ui, sans-serif";
    const width = context.measureText(text).width + 20;
    context.restore();
    return { width, height: 27 };
  }

  function polygonOverlapsRect(polygon, rect) {
    const left = Math.min(...polygon.map((point) => point.x));
    const right = Math.max(...polygon.map((point) => point.x));
    const top = Math.min(...polygon.map((point) => point.y));
    const bottom = Math.max(...polygon.map((point) => point.y));
    return Math.min(right, rect.right) - Math.max(left, rect.left) > 3
      && Math.min(bottom, rect.bottom) - Math.max(top, rect.top) > 3;
  }

  function drawBoard() {
    const box = { x0: -state.cols / 2, x1: state.cols / 2, y0: -.14, y1: 0, z0: -state.rows / 2, z1: state.rows / 2 };
    const outer = projectedFace("top", box).polygon;

    ["xp", "xn", "zp", "zn"]
      .filter(faceIsVisible)
      .map((kind) => projectedFace(kind, box))
      .sort((a, b) => a.depth - b.depth)
      .forEach((face) => {
        const fill = face.kind === "zp" ? COLORS.red : face.kind === "xp" ? COLORS.teal : COLORS.tealDark;
        fillStroke(face.polygon, fill, COLORS.ink, 3);
      });
    fillStroke(outer, COLORS.board, COLORS.ink, 3.4);

    const cells = [];
    for (let row = 0; row < state.rows; row += 1) for (let col = 0; col < state.cols; col += 1) cells.push({ r: row, c: col });
    cells.sort((a, b) => {
      const aDepth = projectPoint(cellWorld(a.r, a.c, 0)).depth;
      const bDepth = projectPoint(cellWorld(b.r, b.c, 0)).depth;
      return aDepth - bDepth;
    });
    cells.forEach((cell) => {
      const polygon = topPolygon(cell.r, cell.c, 0);
      fillStroke(polygon, COLORS.empty, "rgba(56,38,31,.48)", 1.35);
      hitShapes.push({ cell, polygon });
    });
    pathPolygon(outer);
    context.lineWidth = 3.4;
    context.strokeStyle = COLORS.ink;
    context.stroke();
  }

  function drawDirectionLabels() {
    const boardCenter = projectPoint({ x: 0, y: 0, z: 0 });
    const labels = [
      {
        text: "앞",
        fill: COLORS.red,
        color: COLORS.paper,
        topEdge: { x: 0, y: 0, z: state.rows / 2 },
        bottomEdge: { x: 0, y: -.14, z: state.rows / 2 },
      },
      {
        text: "옆",
        fill: COLORS.jade,
        color: COLORS.ink,
        topEdge: { x: state.cols / 2, y: 0, z: 0 },
        bottomEdge: { x: state.cols / 2, y: -.14, z: 0 },
      },
    ];

    labels.forEach((label) => {
      const edge = projectPoint(label.topEdge);
      const edgeBottom = projectPoint(label.bottomEdge);
      const dx = edge.x - boardCenter.x;
      const dy = edge.y - boardCenter.y;
      const length = Math.max(1e-6, Math.hypot(dx, dy));
      const outward = { x: dx / length, y: dy / length };
      const metrics = pillMetrics(label.text);
      const pillRadius = Math.abs(outward.x) * metrics.width / 2
        + Math.abs(outward.y) * metrics.height / 2;
      const gap = 4;
      const x = edgeBottom.x + outward.x * (pillRadius + gap);
      const y = edgeBottom.y + outward.y * (pillRadius + gap);
      const pillRect = {
        left: x - metrics.width / 2,
        right: x + metrics.width / 2,
        top: y - metrics.height / 2,
        bottom: y + metrics.height / 2,
      };
      const isBehindStack = edgeBottom.depth < boardCenter.depth - .015
        && stackFacePolygons.some((face) => (
          face.depth > edgeBottom.depth + .015 && polygonOverlapsRect(face.polygon, pillRect)
        ));
      drawRoundedPill(
        x,
        y,
        label.text,
        label.fill,
        label.color,
        isBehindStack ? .38 : 1,
      );
    });
  }

  function quadPoint(quad, u, v) {
    return {
      x: quad[0].x + (quad[1].x - quad[0].x) * u + (quad[3].x - quad[0].x) * v,
      y: quad[0].y + (quad[1].y - quad[0].y) * u + (quad[3].y - quad[0].y) * v,
    };
  }

  function drawCharacterFace(face, alpha = 1) {
    const faceHeight = (Math.hypot(face[3].x - face[0].x, face[3].y - face[0].y)
      + Math.hypot(face[2].x - face[1].x, face[2].y - face[1].y)) / 2;
    if (faceHeight < 27) return;
    const point = (u, v) => quadPoint(face, u, v);
    const eyeRadius = Math.max(1.15, Math.min(2, layout.scale * .014));
    const verticalAngle = Math.atan2(face[3].y - face[0].y, face[3].x - face[0].x) - Math.PI / 2;
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = COLORS.ink;
    [point(.34, .37), point(.70, .37)].forEach((eye) => {
      context.beginPath();
      context.ellipse(eye.x, eye.y, eyeRadius, eyeRadius * 1.78, verticalAngle, 0, Math.PI * 2);
      context.fill();
    });
    const mouthLeft = point(.44, .58);
    const mouthControl = point(.52, .68);
    const mouthRight = point(.60, .58);
    context.beginPath();
    context.moveTo(mouthLeft.x, mouthLeft.y);
    context.quadraticCurveTo(mouthControl.x, mouthControl.y, mouthRight.x, mouthRight.y);
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.strokeStyle = COLORS.ink;
    context.stroke();
    context.fillStyle = COLORS.gold;
    [point(.17, .62), point(.86, .62)].forEach((cheek) => {
      context.beginPath();
      context.arc(cheek.x, cheek.y, 2.1, 0, Math.PI * 2);
      context.fill();
    });
    context.restore();
  }

  function cubeFaceFill(kind, held = false) {
    if (held) {
      if (kind === "top") return COLORS.red;
      return kind === "xp" || kind === "xn" ? COLORS.jade : COLORS.teal;
    }
    if (kind === "top") return COLORS.woodTop;
    if (kind === "zp") return COLORS.woodLeft;
    if (kind === "xp") return COLORS.woodRight;
    return kind === "zn" ? "#ae7534" : "#8f5f2b";
  }

  function motionLift(cell, level, height, now) {
    if (!motion || !["add", "move"].includes(motion.type)
      || !sameCell(motion.cell, cell) || level !== height || reducedMotion.matches) return 0;
    const elapsed = Math.max(0, now - motion.started);
    const progress = clamp(elapsed / MOTION_MS, 0, 1);
    return Math.sin(progress * Math.PI) * .12;
  }

  function drawStacks(now) {
    const items = [];
    const neighbor = {
      xp: { r: 0, c: 1 }, xn: { r: 0, c: -1 },
      zp: { r: 1, c: 0 }, zn: { r: -1, c: 0 },
    };
    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        const cell = { r: row, c: col };
        const height = effectiveHeight(row, col);
        const center = cellWorld(row, col, 0);
        for (let level = 1; level <= height; level += 1) {
          const lift = motionLift(cell, level, height, now);
          const box = {
            x0: center.x - .5, x1: center.x + .5,
            y0: level - 1, y1: level,
            z0: center.z - .5, z1: center.z + .5,
          };
          const visibleSides = ["xp", "xn", "zp", "zn"].filter((kind) => {
            if (!faceIsVisible(kind)) return false;
            const next = neighbor[kind];
            return effectiveHeight(row + next.r, col + next.c) < level;
          });
          const faceKind = level === height && visibleSides.length
            ? visibleSides.reduce((best, kind) => (
              dot(FACE_NORMALS[kind], layout.basis.view) > dot(FACE_NORMALS[best], layout.basis.view) ? kind : best
            ), visibleSides[0])
            : null;
          visibleSides.forEach((kind) => {
            const face = projectedFace(kind, box, lift);
            items.push({ ...face, cell, showFace: kind === faceKind && ((row + col) % 2 === 0 || sameCell(hover, cell)) });
          });
          if (lift > 1e-5 && level > 1 && faceIsVisible("top")) {
            const supportBox = { ...box, y0: level - 1, y1: level - 1 };
            items.push({ ...projectedFace("top", supportBox), cell, showFace: false, isMotionCap: true });
          }
          if (level === height && faceIsVisible("top")) {
            items.push({ ...projectedFace("top", box, lift), cell, showFace: false });
          }
        }
      }
    }

    items.sort((a, b) => a.depth - b.depth || Number(a.kind === "top") - Number(b.kind === "top"));
    stackFacePolygons = items.map((item) => ({ polygon: item.polygon, depth: item.depth }));
    items.forEach((item) => {
      fillStroke(item.polygon, cubeFaceFill(item.kind), COLORS.woodEdge, Math.max(1.15, Math.min(1.65, layout.scale * .012)));
      hitShapes.push({ cell: item.cell, polygon: item.polygon });
      if (item.showFace) drawCharacterFace(item.polygon, .95);
    });

    if (hover && !drag?.active && !orbit?.active) {
      context.save();
      pathPolygon(topPolygon(hover.r, hover.c, effectiveHeight(hover.r, hover.c)));
      context.lineWidth = 4;
      context.strokeStyle = tool === "erase" ? COLORS.red : COLORS.teal;
      context.setLineDash([7, 5]);
      context.stroke();
      context.restore();
    }
  }

  function drawDrag() {
    if (!drag?.active) return;
    if (drag.to) {
      const valid = !sameCell(drag.from, drag.to) && heightAt(state, drag.to.r, drag.to.c) < MAX_H;
      const targetHeight = heightAt(state, drag.to.r, drag.to.c);
      context.save();
      pathPolygon(topPolygon(drag.to.r, drag.to.c, targetHeight));
      context.fillStyle = valid ? "rgba(111,191,158,.35)" : "rgba(233,79,61,.30)";
      context.fill();
      context.lineWidth = 4;
      context.strokeStyle = valid ? COLORS.teal : COLORS.red;
      context.stroke();
      context.restore();
    }

    const box = { x0: -.5, x1: .5, y0: 0, y1: 1, z0: -.5, z1: .5 };
    const faces = ["xp", "xn", "zp", "zn", "top"]
      .filter(faceIsVisible)
      .map((kind) => projectedFace(kind, box))
      .sort((a, b) => a.depth - b.depth || Number(a.kind === "top") - Number(b.kind === "top"));
    const allPoints = faces.flatMap((face) => face.polygon);
    const centerX = (Math.min(...allPoints.map((point) => point.x)) + Math.max(...allPoints.map((point) => point.x))) / 2;
    const centerY = (Math.min(...allPoints.map((point) => point.y)) + Math.max(...allPoints.map((point) => point.y))) / 2;
    const shiftX = drag.x - centerX;
    const shiftY = drag.y - layout.scale * .42 - centerY;
    const faceKind = ["xp", "xn", "zp", "zn"]
      .filter(faceIsVisible)
      .sort((a, b) => dot(FACE_NORMALS[b], layout.basis.view) - dot(FACE_NORMALS[a], layout.basis.view))[0];
    context.save();
    context.globalAlpha = .96;
    faces.forEach((face) => {
      const polygon = face.polygon.map((point) => ({ x: point.x + shiftX, y: point.y + shiftY }));
      fillStroke(polygon, cubeFaceFill(face.kind, true), COLORS.ink, 3);
      if (face.kind === faceKind) drawCharacterFace(polygon, 1);
    });
    context.restore();
  }

  function requestDraw() {
    if (drawFrame) return;
    drawFrame = requestAnimationFrame(drawScene);
  }

  function drawScene(now) {
    drawFrame = 0;
    if (!layout) return;
    renderedFrames += 1;
    // 기둥이 0개가 되어 drawStacks의 반복문이 비어도 여기서 애니메이션 수명을 끝낸다.
    if (motion && !motionIsActive(motion.started, now)) motion = null;
    context.clearRect(0, 0, layout.width, layout.height);
    hitShapes = [];
    stackFacePolygons = [];
    drawBoard();
    drawStacks(now);
    drawDrag();
    drawDirectionLabels();
    if (motion) requestDraw();
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (pointerDown) return;
    const point = canvasPoint(event);
    const cell = hitCell(point);
    const sourcePolygons = cell
      ? hitShapes.filter((item) => sameCell(item.cell, cell)).map((item) => item.polygon.map((vertex) => ({ ...vertex })))
      : [];
    pointerDown = {
      id: event.pointerId,
      point,
      cell,
      at: performance.now(),
      cameraYaw: camera.yaw,
      cameraPitch: camera.pitch,
      gesture: cell && heightAt(state, cell.r, cell.c) > 0 ? "cube" : "orbit-or-tap",
      // 드래그 중에는 화면의 원본 기둥이 한 층 낮아지므로, 누르기 전 모양을 별도로 보존한다.
      sourcePolygons,
    };
    canvas.setPointerCapture(event.pointerId);
    setHover(cell);
  });

  canvas.addEventListener("pointermove", (event) => {
    const point = canvasPoint(event);
    const cell = hitCell(point);
    if (!pointerDown || pointerDown.id !== event.pointerId) {
      setHover(cell);
      return;
    }

    const distance = Math.hypot(point.x - pointerDown.point.x, point.y - pointerDown.point.y);
    if (!drag && !orbit && distance > 8) {
      if (pointerDown.gesture === "cube" && pointerDown.cell) {
        drag = { active: true, from: { ...pointerDown.cell }, to: cell, x: point.x, y: point.y };
        canvasWrap.classList.add("is-dragging");
      } else {
        orbit = { active: true };
        canvasWrap.classList.add("is-orbiting");
      }
    }

    if (orbit?.active) {
      const dx = point.x - pointerDown.point.x;
      const dy = point.y - pointerDown.point.y;
      camera.yaw = pointerDown.cameraYaw + dx * .009;
      camera.pitch = clamp(pointerDown.cameraPitch - dy * .007, MIN_CAMERA_PITCH, MAX_CAMERA_PITCH);
      layout = { ...layout, basis: cameraBasis() };
      setHover(null);
      requestDraw();
      return;
    } else if (drag?.active) {
      drag.x = point.x;
      drag.y = point.y;
      drag.to = cell;
    }
    setHover(cell);
    requestDraw();
  });

  function finishPointer(event, cancelled) {
    if (!pointerDown || pointerDown.id !== event.pointerId) return;
    const point = canvasPoint(event);
    if (orbit?.active) {
      orbit = null;
      pointerDown = null;
      canvasWrap.classList.remove("is-orbiting");
      setHover(hitCell(point));
      requestDraw();
      if (!cancelled) announce("쌓기나무를 다른 방향에서 보고 있어요.");
      return;
    }
    const dynamicCell = hitCell(point);
    const startedCell = pointerDown.cell;
    const overOriginalSource = pointerDown.sourcePolygons.some((polygon) => pointInPolygon(point, polygon));
    const drop = resolveDragDrop({
      point,
      width: layout?.width || canvas.getBoundingClientRect().width,
      height: layout?.height || canvas.getBoundingClientRect().height,
      dynamicCell,
      sourceCell: startedCell,
      overOriginalSource,
    });
    const releaseCell = drop.cell;

    if (!cancelled && drag?.active && startedCell) {
      if (drop.kind === "remove") {
        commit(take(state, startedCell.r, startedCell.c), `${cellName(startedCell)}의 맨 위 쌓기나무 한 개를 치웠어요.`, startedCell, "take");
      } else if (drop.kind === "same") {
        announce("같은 자리에 다시 놓았어요.");
      } else if (drop.kind === "cancel") {
        announce("쌓기나무가 제자리로 돌아왔어요.");
      } else if (heightAt(state, releaseCell.r, releaseCell.c) >= MAX_H) {
        announce("이 기둥에는 더 올릴 수 없어요.");
      } else {
        commit(move(state, startedCell, releaseCell), `${cellName(releaseCell)}으로 쌓기나무 한 개를 옮겼어요.`, releaseCell, "move");
      }
    } else if (!cancelled && startedCell) {
      if (tool === "erase") {
        const before = heightAt(state, startedCell.r, startedCell.c);
        commit(take(state, startedCell.r, startedCell.c), before > 0 ? `${cellName(startedCell)}에서 쌓기나무 한 개를 지웠어요.` : "비어 있는 칸이에요.", startedCell, "take");
      } else {
        const before = heightAt(state, startedCell.r, startedCell.c);
        commit(add(state, startedCell.r, startedCell.c), before < MAX_H ? `${cellName(startedCell)}에 쌓기나무 한 개를 쌓았어요.` : "한 기둥은 10층까지 쌓을 수 있어요.", startedCell, "add");
      }
    }

    pointerDown = null;
    drag = null;
    canvasWrap.classList.remove("is-dragging");
    canvasWrap.classList.remove("is-orbiting");
    setHover(releaseCell || dynamicCell);
    requestDraw();
  }

  canvas.addEventListener("pointerup", (event) => finishPointer(event, false));
  canvas.addEventListener("pointercancel", (event) => finishPointer(event, true));
  canvas.addEventListener("pointerleave", () => { if (!pointerDown) setHover(null); });

  const observer = new ResizeObserver(resizeCanvas);
  observer.observe(canvasWrap);
  window.addEventListener("resize", resizeCanvas, { passive: true });

  window.__blocksPrototype = {
    getState: () => cloneState(state),
    getViews: () => viewsOf(state),
    getCellPoint: (row, col) => {
      if (!layout || row < 0 || row >= state.rows || col < 0 || col >= state.cols) return null;
      const center = projectPoint(cellWorld(row, col, heightAt(state, row, col)));
      return { x: center.x, y: center.y };
    },
    addAt: (row, col) => commit(add(state, row, col), "", { r: row, c: col }, "add"),
    takeAt: (row, col) => commit(take(state, row, col), "", { r: row, c: col }, "take"),
    moveTop: (from, to) => commit(move(state, from, to), "", to, "move"),
    resizeTo: (cols, rows) => commit(resize(state, cols, rows), "", null, "resize"),
    setCamera: (yaw, pitch) => {
      if (Number.isFinite(yaw)) camera.yaw = yaw;
      if (Number.isFinite(pitch)) camera.pitch = clamp(pitch, MIN_CAMERA_PITCH, MAX_CAMERA_PITCH);
      if (layout) layout = { ...layout, basis: cameraBasis() };
      requestDraw();
    },
    getCamera: () => ({ ...camera }),
    getDiagnostics: () => ({
      motionActive: !!motion,
      drawFramePending: !!drawFrame,
      dragActive: !!drag?.active,
      orbitActive: !!orbit?.active,
      interactionMode: orbit?.active ? "orbit" : drag?.active ? "cube-drag" : pointerDown ? "pending" : "idle",
      yaw: camera.yaw,
      pitch: camera.pitch,
      boardCenter: layout ? { x: layout.originX, y: layout.originY } : null,
      boardScale: layout?.scale || null,
      renderedFrames,
    }),
  };

  renderState();
  resizeCanvas();
  document.documentElement.dataset.blocksReady = "true";
})();
