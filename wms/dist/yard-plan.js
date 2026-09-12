/* ===== 园区平面图（系统设置编辑 + 驾驶舱整园展示） ===== */
const PARK_ID = 'park';
const PARK_STORAGE_KEY = 'wms_floor_plans';
const PARK_API_BASE = ((typeof location !== 'undefined' && location.hostname === 'wms.skd.wang')
  ? ''
  : 'http://wms.skd.wang') + '/api';
const PARK_W = 1680;
const PARK_H = 1040;
const PARK_GRID_COLS = 42;
const PARK_GRID_ROWS = 26;
const PARK_HISTORY_MAX = 80;
const PARK_DRAG_SLOP = 4;
const PARK_ANGLE_SNAP = 90;
const PARK_ZOOM_MIN = 1;
const PARK_ZOOM_MAX = 8;
const PARK_YARD_LOAD_MIN_MS = 2000;

const PARK_TOOLS = [
  { id: 'select', label: '选择' },
  { id: 'warehouse', label: '仓库' },
  { id: 'idle', label: '停用仓库' },
  { id: 'office', label: '办公楼' },
  { id: 'zone', label: '功能区' },
  { id: 'line', label: '生产线' },
  { id: 'door', label: '门' },
  { id: 'stack', label: '堆位' },
  { id: 'road', label: '道路' },
  { id: 'bush', label: '灌木丛' },
];

const PARK_TYPE_META = {
  warehouse: { label: '仓库', color: '#f8e4c5', nest: false, host: true },
  idle: { label: '停用仓库', color: '#8d939c', nest: false, host: true },
  office: { label: '办公楼', color: '#6d8eae', nest: false, host: false },
  zone: { label: '功能区', color: '#7f9aa8', nest: false, host: false },
  line: { label: '生产线', color: '#5f7d8c', nest: true, host: false },
  door: { label: '门', color: '#9ebce9', nest: true, host: false },
  stack: { label: '堆位', color: '#ffffff', nest: true, host: false },
  stamp: { label: '铺装', color: '#6a6e74', nest: false, host: false },
};

const PARK_LEGACY_WH_FILLS = ['#c9b06a', '#c4a45e', '#bfa056', '#b8964a', '#c4aa68'];

const parkEditor = {
  items: [],
  gridCols: PARK_GRID_COLS,
  gridRows: PARK_GRID_ROWS,
  canvasW: PARK_W,
  canvasH: PARK_H,
  selectedId: null,
  tool: 'select',
  snap: true,
  drag: null,
  draw: null,
  history: { past: [], future: [] },
  nameBefore: null,
  ready: false,
};

const parkCache = { plan: null, loaded: false };
let parkLoadPromise = null;
let parkYardRevealPromise = null;
let parkYardHoldDone = false;
const parkYardView = { scale: 1, tx: 0, ty: 0, drag: null };
const parkEditorView = { scale: 1, vx: 0, vy: 0, pan: null, space: false };

function parkApiBase() {
  return PARK_API_BASE;
}

function clampParkGridDim(n, fallback, max) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.max(2, Math.min(max || 200, v));
}

function resolveParkGrid(src) {
  const W = Number(src && src.canvasW) || PARK_W;
  const H = Number(src && src.canvasH) || PARK_H;
  let cols = Number(src && src.gridCols);
  let rows = Number(src && src.gridRows);
  if (!(cols >= 2) || !(rows >= 2)) {
    const px = Number(src && src.grid);
    if (px >= 8 && px <= 80) {
      cols = Math.round(W / px);
      rows = Math.round(H / px);
    } else {
      cols = PARK_GRID_COLS;
      rows = PARK_GRID_ROWS;
    }
  }
  cols = clampParkGridDim(cols, PARK_GRID_COLS, 200);
  rows = clampParkGridDim(rows, PARK_GRID_ROWS, 200);
  return { cols, rows, cellW: W / cols, cellH: H / rows };
}

function parkGridSize() {
  return resolveParkGrid(parkEditor);
}

function parkSyncGridFields() {
  const colsEl = document.getElementById('parkGridCols');
  const rowsEl = document.getElementById('parkGridRows');
  if (colsEl) colsEl.value = parkEditor.gridCols;
  if (rowsEl) rowsEl.value = parkEditor.gridRows;
}

function parkApplyGridFromFields() {
  const colsEl = document.getElementById('parkGridCols');
  const rowsEl = document.getElementById('parkGridRows');
  if (!colsEl && !rowsEl) return false;
  const cols = clampParkGridDim(colsEl ? colsEl.value : parkEditor.gridCols, parkEditor.gridCols || PARK_GRID_COLS, 200);
  const rows = clampParkGridDim(rowsEl ? rowsEl.value : parkEditor.gridRows, parkEditor.gridRows || PARK_GRID_ROWS, 200);
  const changed = cols !== parkEditor.gridCols || rows !== parkEditor.gridRows;
  parkEditor.gridCols = cols;
  parkEditor.gridRows = rows;
  return changed;
}

function parkCanvasBox() {
  return { x: 0, y: 0, w: parkEditor.canvasW || PARK_W, h: parkEditor.canvasH || PARK_H };
}

function parkEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parkRectPts(x, y, w, h) {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

function parkPtsBox(pts) {
  const xs = (pts || []).map((p) => p.x);
  const ys = (pts || []).map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function parkEnsurePts(it) {
  if (!it.pts || it.pts.length !== 4) {
    it.pts = parkRectPts(Number(it.x) || 0, Number(it.y) || 0, Number(it.w) || 40, Number(it.h) || 32);
  }
  it.pts = it.pts.map((p) => ({ x: Number(p.x), y: Number(p.y) }));
  return it;
}

function parkNormalize(it) {
  parkEnsurePts(it);
  const bb = parkPtsBox(it.pts);
  let minW = it.type === 'door' ? 6 : (it.type === 'stamp' ? parkGridSize().cellW : 24);
  let minH = it.type === 'door' ? 12 : (it.type === 'stamp' ? parkGridSize().cellH : 20);
  if (it.parentId) {
    minW = it.type === 'door' ? 3 : 4;
    minH = it.type === 'door' ? 4 : 4;
  }
  const w = Math.max(bb.w || minW, minW);
  const h = Math.max(bb.h || minH, minH);
  it.pts = parkRectPts(bb.x, bb.y, w, h);
  it.x = bb.x;
  it.y = bb.y;
  it.w = w;
  it.h = h;
  it.rot = 0;
  return it;
}

function parkTranslate(it, dx, dy) {
  parkEnsurePts(it);
  it.pts.forEach((p) => { p.x += dx; p.y += dy; });
  const bb = parkPtsBox(it.pts);
  it.x = bb.x;
  it.y = bb.y;
  it.w = bb.w;
  it.h = bb.h;
}

function parkCentroid(pts) {
  const n = pts.length || 1;
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / n,
    y: pts.reduce((s, p) => s + p.y, 0) / n,
  };
}

function parkRotateAround(it, deg, cx, cy) {
  parkEnsurePts(it);
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  it.pts.forEach((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    p.x = cx + dx * cos - dy * sin;
    p.y = cy + dx * sin + dy * cos;
  });
  it.rot = ((Number(it.rot) || 0) + deg) % 360;
  const bb = parkPtsBox(it.pts);
  it.x = bb.x;
  it.y = bb.y;
  it.w = bb.w;
  it.h = bb.h;
}

function parkPtsAttr(pts) {
  return pts.map((p) => `${p.x},${p.y}`).join(' ');
}

function parkCanvasSpan() {
  return {
    w: Number(parkEditor.canvasW) || PARK_W,
    h: Number(parkEditor.canvasH) || PARK_H,
  };
}

function parkGridLine(i, count, span) {
  if (!(count >= 1) || !(span > 0)) return 0;
  return (i * span) / count;
}

function parkNearestGridIndex(v, count, span) {
  if (!(count >= 1) || !(span > 0) || !Number.isFinite(Number(v))) return 0;
  return Math.round((Number(v) * count) / span);
}

function parkSnapAxis(v, count, span) {
  return parkGridLine(parkNearestGridIndex(v, count, span), count, span);
}

function parkSnapAxisInside(v, count, span, lo, hi) {
  let i = parkNearestGridIndex(v, count, span);
  if (Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo) {
    const iLo = Math.ceil((lo * count) / span - 1e-6);
    const iHi = Math.floor((hi * count) / span + 1e-6);
    if (iLo <= iHi) i = Math.max(iLo, Math.min(iHi, i));
  }
  return parkGridLine(i, count, span);
}

function parkSnapX(v, bounds) {
  const { cols } = parkGridSize();
  const { w } = parkCanvasSpan();
  if (bounds) return parkSnapAxisInside(v, cols, w, bounds.x, bounds.x + bounds.w);
  return parkSnapAxis(v, cols, w);
}

function parkSnapY(v, bounds) {
  const { rows } = parkGridSize();
  const { h } = parkCanvasSpan();
  if (bounds) return parkSnapAxisInside(v, rows, h, bounds.y, bounds.y + bounds.h);
  return parkSnapAxis(v, rows, h);
}

function parkPlanSource() {
  if (parkEditor.items && parkEditor.items.length) {
    return {
      canvasW: parkEditor.canvasW,
      canvasH: parkEditor.canvasH,
      gridCols: parkEditor.gridCols,
      gridRows: parkEditor.gridRows,
      items: parkEditor.items,
    };
  }
  if (parkCache.plan && Array.isArray(parkCache.plan.items)) return parkCache.plan;
  return null;
}

function parkStackGridOf(code, plan) {
  const src = plan || parkPlanSource();
  if (!src || !code) return null;
  const item = (src.items || []).find((it) => it.type === 'stack' && it.code === code);
  if (!item) return null;
  const W = Number(src.canvasW) || PARK_W;
  const H = Number(src.canvasH) || PARK_H;
  const dims = resolveParkGrid(src);
  const c0 = parkNearestGridIndex(item.x, dims.cols, W);
  const c1 = Math.max(c0 + 1, parkNearestGridIndex(item.x + item.w, dims.cols, W));
  const r0 = parkNearestGridIndex(item.y, dims.rows, H);
  const r1 = Math.max(r0 + 1, parkNearestGridIndex(item.y + item.h, dims.rows, H));
  return {
    cols: Math.max(1, c1 - c0),
    rows: Math.max(1, r1 - r0),
    c0,
    r0,
    c1,
    r1,
  };
}

function parkSnapPos(x, y, w, h, bounds) {
  const box = bounds || parkCanvasBox();
  const ww = Math.max(1, Number(w) || 1);
  const hh = Math.max(1, Number(h) || 1);
  let x0 = parkSnapX(x, bounds);
  let y0 = parkSnapY(y, bounds);
  if (x0 + ww > box.x + box.w) x0 = box.x + box.w - ww;
  if (y0 + hh > box.y + box.h) y0 = box.y + box.h - hh;
  if (x0 < box.x) x0 = box.x;
  if (y0 < box.y) y0 = box.y;
  return { x: x0, y: y0, w: ww, h: hh };
}

function parkSnapBox(x, y, w, h, minW, minH, bounds) {
  const minX = Math.max(0, Number(minW) || 0);
  const minY = Math.max(0, Number(minH) || 0);
  let x0 = parkSnapX(x, bounds);
  let y0 = parkSnapY(y, bounds);
  let x1 = parkSnapX(x + w, bounds);
  let y1 = parkSnapY(y + h, bounds);
  if (x1 < x0) {
    const t = x0; x0 = x1; x1 = t;
  }
  if (y1 < y0) {
    const t = y0; y0 = y1; y1 = t;
  }
  if (x1 - x0 < minX) {
    const grown = parkSnapX(x0 + minX, bounds);
    x1 = grown - x0 >= minX * 0.5 ? grown : x0 + minX;
  }
  if (y1 - y0 < minY) {
    const grown = parkSnapY(y0 + minY, bounds);
    y1 = grown - y0 >= minY * 0.5 ? grown : y0 + minY;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function parkApplyBox(it, box) {
  it.x = box.x;
  it.y = box.y;
  it.w = box.w;
  it.h = box.h;
  it.pts = parkRectPts(box.x, box.y, box.w, box.h);
}

function parkGridLinesMarkup(W, H, dims, stroke) {
  let svg = '';
  for (let i = 1; i < dims.cols; i += 1) {
    const x = parkGridLine(i, dims.cols, W);
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${stroke}" stroke-width="0.7"/>`;
  }
  for (let j = 1; j < dims.rows; j += 1) {
    const y = parkGridLine(j, dims.rows, H);
    svg += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${stroke}" stroke-width="0.7"/>`;
  }
  return svg;
}

function parkNewId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function parkCloneState() {
  return {
    gridCols: parkEditor.gridCols,
    gridRows: parkEditor.gridRows,
    items: JSON.parse(JSON.stringify(parkEditor.items || [])),
    selectedId: parkEditor.selectedId,
  };
}

function parkApplyState(state) {
  const dims = resolveParkGrid(state);
  parkEditor.gridCols = dims.cols;
  parkEditor.gridRows = dims.rows;
  parkEditor.items = JSON.parse(JSON.stringify(state.items || []));
  parkEditor.selectedId = state.selectedId;
  parkSyncGridFields();
}

function parkResetHistory() {
  parkEditor.history = { past: [], future: [] };
  parkSyncHistoryButtons();
}

function parkCommit(before) {
  if (!before) return;
  if (JSON.stringify({ gridCols: before.gridCols, gridRows: before.gridRows, items: before.items }) === JSON.stringify({ gridCols: parkEditor.gridCols, gridRows: parkEditor.gridRows, items: parkEditor.items })) return;
  parkEditor.history.past.push(before);
  if (parkEditor.history.past.length > PARK_HISTORY_MAX) parkEditor.history.past.shift();
  parkEditor.history.future = [];
  parkSyncHistoryButtons();
}

function parkUndo() {
  if (!parkEditor.history.past.length) return;
  parkEditor.history.future.push(parkCloneState());
  parkApplyState(parkEditor.history.past.pop());
  parkSyncHistoryButtons();
  paintParkEditor();
}

function parkRedo() {
  if (!parkEditor.history.future.length) return;
  parkEditor.history.past.push(parkCloneState());
  parkApplyState(parkEditor.history.future.pop());
  parkSyncHistoryButtons();
  paintParkEditor();
}

function parkSyncHistoryButtons() {
  const undo = document.getElementById('parkUndoBtn');
  const redo = document.getElementById('parkRedoBtn');
  if (undo) undo.disabled = !parkEditor.history.past.length;
  if (redo) redo.disabled = !parkEditor.history.future.length;
}

function parkIsEditorOpen() {
  const page = document.querySelector('[data-page="settings"]');
  const tab = document.getElementById('tab-floorplan');
  if (!page || !tab) return false;
  if (!page.classList.contains('active')) return false;
  return tab.style.display !== 'none';
}

function parkSelected() {
  return parkEditor.items.find((x) => x.id === parkEditor.selectedId) || null;
}

function parkChildren(parentId) {
  return parkEditor.items.filter((it) => it.parentId === parentId);
}

function parkIsHost(it) {
  return it && (it.type === 'warehouse' || it.type === 'idle');
}

function parkChildRel(host, ch) {
  parkEnsurePts(ch);
  const bw = host.w || 1;
  const bh = host.h || 1;
  return {
    id: ch.id,
    rx: (ch.x - host.x) / bw,
    ry: (ch.y - host.y) / bh,
    rw: ch.w / bw,
    rh: ch.h / bh,
  };
}

function parkCaptureChildRels(host) {
  if (!parkIsHost(host)) return [];
  return parkChildren(host.id).map((ch) => parkChildRel(host, ch));
}

function parkLayoutChildren(host, rels) {
  if (!host || !rels || !rels.length) return;
  rels.forEach((k) => {
    const ch = parkEditor.items.find((x) => x.id === k.id);
    if (!ch) return;
    const nx = host.x + k.rx * host.w;
    const ny = host.y + k.ry * host.h;
    const nw = Math.max(1, k.rw * host.w);
    const nh = Math.max(1, k.rh * host.h);
    ch.pts = parkRectPts(nx, ny, nw, nh);
    parkTranslate(ch, 0, 0);
    parkClampToBox(ch, { x: host.x, y: host.y, w: host.w, h: host.h }, { keepSize: true });
  });
}

function parkHostAt(x, y, items) {
  const list = (items || parkEditor.items).filter(parkIsHost);
  let best = null;
  let area = Infinity;
  list.forEach((it) => {
    if (x >= it.x && y >= it.y && x <= it.x + it.w && y <= it.y + it.h) {
      const a = it.w * it.h;
      if (a < area) {
        area = a;
        best = it;
      }
    }
  });
  return best;
}

function parkClampToBox(it, box, opts = {}) {
  parkEnsurePts(it);
  const bb = parkPtsBox(it.pts);
  let dx = 0;
  let dy = 0;
  if (bb.x < box.x) dx = box.x - bb.x;
  if (bb.y < box.y) dy = box.y - bb.y;
  if (bb.x + bb.w + dx > box.x + box.w) dx = box.x + box.w - (bb.x + bb.w);
  if (bb.y + bb.h + dy > box.y + box.h) dy = box.y + box.h - (bb.y + bb.h);
  if (dx || dy) parkTranslate(it, dx, dy);
  if (opts.keepSize) return;
  const bb2 = parkPtsBox(it.pts);
  if (bb2.w > box.w + 0.5 || bb2.h > box.h + 0.5) {
    it.pts = parkRectPts(box.x, box.y, Math.min(bb2.w, box.w), Math.min(bb2.h, box.h));
    it.x = box.x;
    it.y = box.y;
    it.w = Math.min(bb2.w, box.w);
    it.h = Math.min(bb2.h, box.h);
  }
}

function parkBoundsFor(it) {
  if (it.parentId) {
    const parent = parkEditor.items.find((x) => x.id === it.parentId);
    if (parent) return { x: parent.x, y: parent.y, w: parent.w, h: parent.h };
  }
  return parkCanvasBox();
}

function parkSettle(it, opts = {}) {
  if (!it) return;
  const keepSize = !!opts.keepSize;
  parkNormalize(it);
  const bounds = parkBoundsFor(it);
  if (parkEditor.snap) {
    const min = parkMinSize(it.type === 'stamp' ? it.kind : it.type);
    if (keepSize) parkApplyBox(it, parkSnapPos(it.x, it.y, it.w, it.h, bounds));
    else parkApplyBox(it, parkSnapBox(it.x, it.y, it.w, it.h, min.w, min.h, bounds));
  }
  parkClampToBox(it, bounds, { keepSize });
  parkNormalize(it);
  if (parkEditor.snap && !keepSize) {
    const min = parkMinSize(it.type === 'stamp' ? it.kind : it.type);
    parkApplyBox(it, parkSnapBox(it.x, it.y, it.w, it.h, min.w, min.h, parkBoundsFor(it)));
    parkClampToBox(it, parkBoundsFor(it));
    parkNormalize(it);
  }
  if (parkIsHost(it) && !opts.skipKids) {
    parkChildren(it.id).forEach((ch) => {
      parkClampToBox(ch, { x: it.x, y: it.y, w: it.w, h: it.h }, { keepSize: true });
      parkNormalize(ch);
    });
  }
}

function parkTypeFill(type) {
  return (PARK_TYPE_META[type] || {}).color || '';
}

function parkEnsureTypeFill(it) {
  if (!it) return it;
  const cur = String(it.color || '').toLowerCase();
  if (it.type === 'stack') it.color = '#ffffff';
  else if (it.type === 'door' && (!cur || cur === '#6b5344')) it.color = '#9ebce9';
  else if (it.type === 'warehouse' && (!cur || PARK_LEGACY_WH_FILLS.includes(cur))) it.color = '#f8e4c5';
  return it;
}

function parkItemColor(it) {
  parkEnsureTypeFill(it);
  if (it.type === 'stack') return '#ffffff';
  if (it.color) return it.color;
  if (it.type === 'stamp' && it.kind === 'bush') return '#3d7a45';
  if (it.type === 'stamp' && it.kind === 'road') return '#5c6066';
  return parkTypeFill(it.type) || '#9aa3ad';
}

function parkHexLuma(color) {
  const raw = String(color || '').trim();
  const hex = raw.startsWith('#') ? raw.slice(1) : '';
  if (hex.length !== 3 && hex.length !== 6) return 0.45;
  const n = hex.length === 3
    ? hex.split('').map((c) => c + c).join('')
    : hex;
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function parkContrastLabel(fill) {
  return parkHexLuma(fill) > 0.48 ? '#1A2332' : '#E8F7FF';
}

function parkDefaultLabel(type, kind) {
  if (type === 'stamp') return kind === 'bush' ? '灌木丛' : '道路';
  return (PARK_TYPE_META[type] || {}).label || '功能区';
}

function parkMakeItem(type, x, y, w, h, extra) {
  const it = parkNormalize({
    id: parkNewId(type === 'stamp' ? extra?.kind || 'stamp' : type),
    type,
    label: extra?.label || parkDefaultLabel(type, extra?.kind),
    color: extra?.color || parkTypeFill(type) || '',
    x,
    y,
    w,
    h,
    rot: 0,
    pts: parkRectPts(x, y, w, h),
    ...extra,
  });
  return it;
}

function parkPlaceStacks(parent, stacks, opts = {}) {
  const pad = opts.pad ?? 14;
  const gap = opts.gap ?? 6;
  const topStrip = opts.topStrip ?? 0;
  const botStrip = opts.botStrip ?? 28;
  const n = stacks.length;
  const cols = opts.cols || (n <= 4 ? 2 : 4);
  const rows = Math.ceil(n / cols);
  const boxX = parent.x + pad;
  const boxY = parent.y + pad + topStrip;
  const boxW = parent.w - pad * 2;
  const boxH = parent.h - pad * 2 - topStrip - botStrip;
  const cw = (boxW - gap * (cols - 1)) / cols;
  const ch = (boxH - gap * (rows - 1)) / rows;
  return stacks.map((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = boxX + col * (cw + gap);
    const y = boxY + row * (ch + gap);
    return parkMakeItem('stack', x, y, cw, ch, {
      parentId: parent.id,
      code: s.code,
      color: '#ffffff',
      label: s.code,
    });
  });
}

function parkPlaceDoors(parent, count, side) {
  const doorW = 54;
  const doorH = 16;
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const t = (i + 1) / (count + 1);
    let x;
    let y;
    if (side === 'north') {
      x = parent.x + parent.w * t - doorW / 2;
      y = parent.y;
    } else if (side === 'east') {
      x = parent.x + parent.w - doorH;
      y = parent.y + parent.h * t - doorW / 2;
    } else {
      x = parent.x + parent.w * t - doorW / 2;
      y = parent.y + parent.h - doorH;
    }
    items.push(parkMakeItem('door', x, y, doorW, doorH, {
      parentId: parent.id,
      label: `${i + 1}号门`,
      color: '#9ebce9',
    }));
  }
  return items;
}

function defaultParkPlan() {
  const whByNo = {};
  (typeof WAREHOUSES !== 'undefined' ? WAREHOUSES : []).forEach((w) => { whByNo[w.no] = w; });

  const office = parkMakeItem('office', 40, 40, 280, 160, { label: '办公楼', color: '#6d8eae' });
  const idle = parkMakeItem('idle', 1360, 40, 280, 160, { label: '3仓（停用）', color: '#8d939c' });
  const roadH1 = parkMakeItem('stamp', 40, 210, 1600, 70, { kind: 'road', label: '主干道' });
  const roadV = parkMakeItem('stamp', 790, 210, 70, 790, { kind: 'road', label: '南北干道' });
  const roadH2 = parkMakeItem('stamp', 40, 630, 1600, 50, { kind: 'road', label: '次干道' });
  const bushTop = parkMakeItem('stamp', 20, 8, 1640, 24, { kind: 'bush', label: '灌木丛' });
  const bushMid = parkMakeItem('stamp', 340, 70, 1000, 40, { kind: 'bush', label: '灌木丛' });
  const bushBot = parkMakeItem('stamp', 20, 1012, 1640, 20, { kind: 'bush', label: '灌木丛' });

  const wh1 = parkMakeItem('warehouse', 40, 300, 360, 320, { label: '1仓', color: '#f8e4c5', whId: 'wh1', whNo: 1 });
  const wh2 = parkMakeItem('warehouse', 420, 300, 350, 320, { label: '2仓', color: '#f8e4c5', whId: 'wh2', whNo: 2 });
  const wh4 = parkMakeItem('warehouse', 880, 300, 760, 320, { label: '4仓', color: '#f8e4c5', whId: 'wh4', whNo: 4 });
  const wh5 = parkMakeItem('warehouse', 40, 690, 730, 310, { label: '5仓', color: '#f8e4c5', whId: 'wh5', whNo: 5 });
  const wh6 = parkMakeItem('warehouse', 880, 690, 760, 310, { label: '6仓', color: '#f8e4c5', whId: 'wh6', whNo: 6 });

  const line4 = parkMakeItem('line', wh4.x + 14, wh4.y + 12, wh4.w - 28, 36, { parentId: wh4.id, label: '4#混矿线', color: '#5f7d8c' });
  const line5 = parkMakeItem('line', wh5.x + 14, wh5.y + 12, wh5.w - 28, 36, { parentId: wh5.id, label: '5#筛分线', color: '#5f7d8c' });
  const line6 = parkMakeItem('line', wh6.x + 14, wh6.y + 12, wh6.w - 28, 36, { parentId: wh6.id, label: '6#成品线', color: '#5f7d8c' });

  const stacks = [
    ...parkPlaceStacks(wh1, whByNo[1]?.stacks || [], { cols: 2, topStrip: 0 }),
    ...parkPlaceStacks(wh2, whByNo[2]?.stacks || [], { cols: 2, topStrip: 0 }),
    ...parkPlaceStacks(wh4, whByNo[4]?.stacks || [], { cols: 4, topStrip: 44 }),
    ...parkPlaceStacks(wh5, whByNo[5]?.stacks || [], { cols: 4, topStrip: 44 }),
    ...parkPlaceStacks(wh6, whByNo[6]?.stacks || [], { cols: 4, topStrip: 44 }),
  ];
  const doors = [
    ...parkPlaceDoors(wh1, 2, 'north'),
    ...parkPlaceDoors(wh2, 2, 'north'),
    ...parkPlaceDoors(wh4, 3, 'north'),
    ...parkPlaceDoors(wh5, 3, 'north'),
    ...parkPlaceDoors(wh6, 3, 'north'),
    ...parkPlaceDoors(idle, 1, 'south'),
  ];

  return {
    kind: 'park',
    gridCols: PARK_GRID_COLS,
    gridRows: PARK_GRID_ROWS,
    canvasW: PARK_W,
    canvasH: PARK_H,
    items: [bushTop, bushMid, bushBot, roadH1, roadV, roadH2, office, idle, wh1, wh2, wh4, wh5, wh6, line4, line5, line6, ...stacks, ...doors],
    rooms: 0,
    doors: doors.length,
    savedAt: null,
  };
}

function parkFindStack(code) {
  if (typeof WAREHOUSES === 'undefined') return null;
  for (let i = 0; i < WAREHOUSES.length; i += 1) {
    const s = WAREHOUSES[i].stacks.find((x) => x.code === code);
    if (s) return { wh: WAREHOUSES[i], stack: s };
  }
  return null;
}

function parkLotsFor(stack) {
  if (typeof STACK_LOTS !== 'undefined' && STACK_LOTS[stack.code]) {
    return STACK_LOTS[stack.code].map((x) => ({ ...x }));
  }
  if (stack.mat && stack.mat !== '空闲' && stack.usedTon > 0) {
    const kind = (stack.batchType === '生产批次' || stack.batchType === '生产批次号') ? '混成品' : '';
    return [{ consignor: '', kind, origin: stack.mat, weight: stack.usedTon, batch: stack.batch }];
  }
  return [];
}

function parkOwnerKey(name) {
  const s = String(name || '');
  if (s.includes('南国')) return 'ng';
  if (s.includes('五矿')) return 'wm';
  if (s.includes('金川')) return 'jc';
  return '';
}

function parkCargoKind(lot) {
  const k = String((lot && (lot.kind || lot.cargoType)) || '');
  if (k.includes('混成')) return 'mix';
  if (k.includes('报备')) return 'filed';
  if (k.includes('达标')) return 'ok';
  const batch = String((lot && lot.batch) || '');
  if (batch.startsWith('FL-')) return 'mix';
  return 'ok';
}

function parkCargoFill(lot) {
  if (!lot) return '#9aa3ad';
  const kind = parkCargoKind(lot);
  if (kind === 'mix') return '#8B939E';
  const owner = parkOwnerKey(lot.consignor);
  const map = {
    ng: { ok: '#8FE3A8', filed: '#1B7A45' },
    wm: { ok: '#F6DE7A', filed: '#C08A10' },
    jc: { ok: '#8EC4F7', filed: '#1B5F9E' },
  };
  const pair = map[owner];
  if (pair) return pair[kind] || pair.ok;
  return kind === 'filed' ? '#5A6A7E' : '#B8C0CC';
}

function parkCargoStroke(fill) {
  const luma = parkHexLuma(fill);
  return luma > 0.55 ? 'rgba(26,35,50,0.28)' : 'rgba(8,16,24,0.45)';
}

function parkFormatWeight(t) {
  const n = Number(t) || 0;
  if (n >= 5000) {
    const w = n / 10000;
    return `${Number.isInteger(w) ? w : w.toFixed(1)}w`;
  }
  return `${Math.round(n)}吨`;
}

function parkCornerLabel(text, bb, fill, opts = {}) {
  return parkItemLabel(text, bb, fill, { ...opts, align: 'corner' });
}

function parkLabelAlign(type) {
  if (type === 'warehouse' || type === 'idle' || type === 'stack') return 'corner';
  return 'center';
}

function parkWarehouseNo(it) {
  if (it && (it.whNo === '码头' || it.whId === 'whDock')) return '码头';
  const n = Number(it && it.whNo);
  if (Number.isFinite(n) && n > 0) return n;
  const m = String((it && it.label) || '').match(/(\d+)\s*(?:#|号|仓)/);
  if (m) return Number(m[1]);
  if (String((it && it.label) || '').includes('码头')) return '码头';
  return null;
}

function parkWhOutsideText(it) {
  const n = parkWarehouseNo(it);
  return n ? `${n}#` : '';
}

function parkWhInnerLabel(it) {
  const raw = String((it && it.label) || '').trim();
  if (!raw) return '';
  return raw
    .replace(/^\d+\s*(?:#|号)?\s*仓/, '')
    .replace(/^[（(]\s*/, '')
    .replace(/\s*[)）]$/, '')
    .trim();
}

function parkStackMapLabel(it) {
  return String((it && (it.label || it.code)) || '').replace(/^\d+#/, '').trim();
}

function parkOutsideWhMark(text, bb, fill, canvasH) {
  const raw = String(text || '').trim();
  if (!raw || !bb) return '';
  const fs = Math.max(13, Math.min(20, bb.h * 0.11));
  const gap = 6;
  const x = bb.x + bb.w / 2;
  let y = bb.y + bb.h + gap;
  let baseline = 'hanging';
  const H = Number(canvasH) || PARK_H;
  if (y + fs + 2 > H && bb.y >= fs + 4) {
    y = bb.y - gap;
    baseline = 'alphabetic';
  }
  return `<text class="park-wh-mark" x="${x}" y="${y}" fill="${fill}" font-size="${fs}" font-weight="800" text-anchor="middle" dominant-baseline="${baseline}">${parkEscape(raw)}</text>`;
}

function parkCharWidth(ch, fs) {
  return /[\u0000-\u00ff]/.test(ch) ? fs * 0.56 : fs;
}

function parkWrapLines(text, maxWidth, fs) {
  const chars = Array.from(String(text || ''));
  if (!chars.length) return [];
  const lines = [];
  let cur = '';
  let curW = 0;
  chars.forEach((ch) => {
    const w = parkCharWidth(ch, fs);
    if (cur && curW + w > maxWidth) {
      lines.push(cur);
      cur = ch;
      curW = w;
    } else {
      cur += ch;
      curW += w;
    }
  });
  if (cur) lines.push(cur);
  return lines;
}

function parkFitWrappedLabel(raw, bb, opts = {}) {
  const pad = opts.pad ?? 4;
  const maxW = Math.max(6, bb.w - pad * 2);
  const maxH = Math.max(6, bb.h - pad * 2);
  const vertical = bb.h >= bb.w * 1.35 && bb.w < Math.max(36, bb.h * 0.55);
  let fs = Math.min(opts.maxFs ?? 14, maxH * 0.9, vertical ? maxW * 0.92 : maxW * 0.55);
  fs = Math.max(5, fs);
  let lines = [];
  let lineH = fs * 1.18;
  for (let i = 0; i < 28; i += 1) {
    lines = vertical ? Array.from(raw) : parkWrapLines(raw, maxW, fs);
    if (!lines.length) lines = [raw];
    lineH = fs * (vertical ? 1.08 : 1.18);
    const totalH = lines.length * lineH;
    const longest = lines.reduce((m, ln) => Math.max(m, Array.from(ln).reduce((s, ch) => s + parkCharWidth(ch, fs), 0)), 0);
    if (totalH <= maxH + 0.8 && longest <= maxW + 0.8) break;
    fs = Math.max(5, fs - 0.45);
  }
  return { lines, fs, lineH };
}

function parkItemLabel(text, bb, fill, opts = {}) {
  const raw = String(text || '').trim();
  if (!raw || !bb || opts.align === 'none') return '';
  const pad = opts.pad ?? 6;
  if (opts.align === 'center') {
    const fit = parkFitWrappedLabel(raw, bb, { pad: Math.min(pad, 4), maxFs: opts.maxFs ?? 14 });
    const x = bb.x + bb.w / 2;
    const totalH = fit.lines.length * fit.lineH;
    const y0 = bb.y + bb.h / 2 - totalH / 2 + fit.lineH / 2;
    const tspans = fit.lines.map((ln, i) => `<tspan x="${x}" y="${y0 + i * fit.lineH}">${parkEscape(ln)}</tspan>`).join('');
    return `<text class="park-zone-label" fill="${fill}" font-size="${fit.fs}" font-weight="700" text-anchor="middle" dominant-baseline="central">${tspans}</text>`;
  }
  const fs = Math.max(7, Math.min(opts.maxFs ?? 13, bb.h * 0.28, bb.w / Math.max(raw.length * 0.72, 1)));
  const x = bb.x + pad;
  const y = bb.y + bb.h - pad - 1;
  return `<text class="park-corner-label" x="${x}" y="${y}" fill="${fill}" font-size="${fs}" font-weight="700">${parkEscape(raw)}</text>`;
}

function parkStampTiles(it, uid, dims, canvas) {
  const cell = dims || parkGridSize();
  const W = Number(canvas && canvas.w) || PARK_W;
  const H = Number(canvas && canvas.h) || PARK_H;
  const kind = it.kind || 'road';
  const c0 = parkNearestGridIndex(it.x, cell.cols, W);
  const c1 = Math.max(c0 + 1, parkNearestGridIndex(it.x + it.w, cell.cols, W));
  const r0 = parkNearestGridIndex(it.y, cell.rows, H);
  const r1 = Math.max(r0 + 1, parkNearestGridIndex(it.y + it.h, cell.rows, H));
  const tw = W / cell.cols;
  const th = H / cell.rows;
  let tiles = '';
  for (let r = r0; r < r1; r += 1) {
    for (let c = c0; c < c1; c += 1) {
      const x = parkGridLine(c, cell.cols, W);
      const y = parkGridLine(r, cell.rows, H);
      if (kind === 'bush') {
        tiles += `<g transform="translate(${x},${y})">
          <rect width="${tw}" height="${th}" fill="none"/>
          <ellipse cx="${tw * 0.5}" cy="${th * 0.62}" rx="${tw * 0.38}" ry="${th * 0.28}" fill="#2f6a38"/>
          <circle cx="${tw * 0.38}" cy="${th * 0.42}" r="${Math.min(tw, th) * 0.28}" fill="#3d7a45"/>
          <circle cx="${tw * 0.62}" cy="${th * 0.38}" r="${Math.min(tw, th) * 0.24}" fill="#4a9154"/>
        </g>`;
      } else {
        tiles += `<g transform="translate(${x},${y})">
          <rect width="${tw}" height="${th}" fill="#5c6066"/>
          <rect x="0" y="${th * 0.46}" width="${tw}" height="${Math.max(1.2, th * 0.08)}" fill="#d4c36a" opacity="0.85"
            stroke="none"/>
          <line x1="${tw * 0.12}" y1="${th * 0.5}" x2="${tw * 0.88}" y2="${th * 0.5}" stroke="#5c6066" stroke-width="${Math.max(1, th * 0.06)}" stroke-dasharray="${tw * 0.18} ${tw * 0.12}"/>
        </g>`;
      }
    }
  }
  return `<g class="park-stamp" data-id="${parkEscape(it.id)}" data-type="stamp" data-kind="${parkEscape(kind)}">${tiles}</g>`;
}

function parkCargoCells(stackItem, theme) {
  const found = parkFindStack(stackItem.code);
  if (!found) return '';
  const stack = found.stack;
  const g = parkStackGridOf(stackItem.code) || { rows: 1, cols: 1 };
  const rows = Math.max(1, g.rows || 1);
  const cols = Math.max(1, g.cols || 1);
  const lots = parkLotsFor(stack);
  const total = rows * cols;
  const usedCount = Math.max(0, Math.min(total, Math.round(total * (stack.used || 0) / 100)));
  const reserved = (typeof getReservedCells === 'function') ? getReservedCells(stack.code) : [];
  const reservedSet = new Set(reserved.map((c) => `${c.r},${c.c}`));
  const lotCells = [];
  const lotWeights = lots.map((l) => l.weight || 0);
  const lotSum = lotWeights.reduce((s, n) => s + n, 0) || 1;
  let cursor = 0;
  lots.forEach((lot, li) => {
    const n = usedCount ? Math.max(1, Math.round(usedCount * (lot.weight || 0) / lotSum)) : 0;
    for (let k = 0; k < n && cursor < usedCount; k += 1) {
      lotCells[cursor] = li;
      cursor += 1;
    }
  });
  while (cursor < usedCount) {
    lotCells[cursor] = lots.length ? lots.length - 1 : 0;
    cursor += 1;
  }
  const cw = stackItem.w / cols;
  const ch = stackItem.h / rows;
  let svg = '';
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      const x = stackItem.x + c * cw;
      const y = stackItem.y + r * ch;
      const key = `${r},${c}`;
      const occupied = i < usedCount;
      const isRes = reservedSet.has(key);
      let fill = 'transparent';
      let stroke = theme === 'cockpit' ? 'rgba(26, 35, 50, 0.22)' : 'rgba(0,0,0,0.08)';
      let sw = 0.4;
      const lot = occupied
        ? (lots.length ? lots[lotCells[i]] : { consignor: '', kind: stack.batchType === '生产批次' ? '混成品' : '达标矿', batch: stack.batch })
        : null;
      if (occupied) {
        fill = parkCargoFill(lot);
        stroke = parkCargoStroke(fill);
      }
      if (isRes) {
        stroke = theme === 'cockpit' ? '#00E5FF' : '#1B4F8A';
        sw = 1.2;
        if (!occupied) fill = theme === 'cockpit' ? 'rgba(0,229,255,0.22)' : 'rgba(47,128,196,0.28)';
      }
      const ticket = (lot && lot.batch) || (occupied && stack.batch && stack.batch !== '—' ? stack.batch : '');
      const lotAttr = ticket ? `data-lot="${parkEscape(ticket)}"` : '';
      const ownerAttr = lot && lot.consignor ? `data-consignor="${parkEscape(lot.consignor)}"` : '';
      const kindAttr = lot && lot.kind ? `data-kind="${parkEscape(lot.kind)}"` : '';
      svg += `<rect class="park-cell${occupied ? ' is-cargo' : ''}" data-code="${parkEscape(stack.code)}" data-wh="${parkEscape(found.wh.id)}" data-area="${parkEscape(stack.area)}" data-mat="${parkEscape(stack.mat)}" data-used="${stack.used}" data-cap="${stack.cap}" data-batch="${parkEscape(stack.batch || '')}" data-r="${r}" data-c="${c}" ${lotAttr} ${ownerAttr} ${kindAttr} x="${x}" y="${y}" width="${Math.max(0.5, cw - 0.4)}" height="${Math.max(0.5, ch - 0.4)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    }
  }
  if (theme === 'cockpit' && lots.length && usedCount > 0) {
    const first = lots[0];
    const label = [first.consignor, first.kind, parkFormatWeight(stack.usedTon)].filter(Boolean).join(' ');
    svg += parkCornerLabel(label, { x: stackItem.x, y: stackItem.y, w: stackItem.w, h: Math.min(stackItem.h, 28) }, '#1A2332', { maxFs: 10, pad: 3 });
  }
  return svg;
}

function parkThemeColors(theme, it) {
  const fill = parkItemColor(it);
  const darkLabel = it.type === 'stack' ? '#5a1f12' : '#1A2332';
  const lightLabel = parkContrastLabel(fill);
  if (theme !== 'cockpit') {
    return {
      fill,
      stroke: it.type === 'stack' ? '#8a6a28' : '#4a5560',
      label: darkLabel,
      text: '#1A2332',
    };
  }
  return {
    fill,
    stroke: it.type === 'stack' ? '#8a6a28' : '#3a4a58',
    label: lightLabel,
    text: '#D6EEFF',
  };
}

function renderParkMarkup(plan, opts = {}) {
  const theme = opts.theme || 'editor';
  const interactive = !!opts.interactive;
  const overlay = opts.overlayCargo !== false && theme === 'cockpit';
  const selectedId = opts.selectedId || null;
  const uid = opts.svgId || 'park';
  const dims = resolveParkGrid(plan);
  const W = Number(plan.canvasW) || PARK_W;
  const H = Number(plan.canvasH) || PARK_H;
  const items = (plan.items || []).map((it) => parkEnsureTypeFill(parkNormalize({
    ...it,
    pts: (it.pts || []).map((p) => ({ x: p.x, y: p.y })),
  })));
  const order = { stamp: 0, office: 1, idle: 1, warehouse: 1, zone: 1, line: 2, stack: 3, door: 4 };
  const sorted = items.slice().sort((a, b) => (order[a.type] ?? 1) - (order[b.type] ?? 1));
  const bg = theme === 'cockpit' ? '#071422' : '#eef1f4';
  const gridStroke = theme === 'cockpit' ? 'rgba(0,229,255,0.08)' : '#c5ccd4';

  const body = sorted.map((it) => {
    if (it.type === 'stamp') return parkStampTiles(it, uid, dims, { w: W, h: H });
    const selected = interactive && it.id === selectedId;
    const pal = parkThemeColors(theme, it);
    const fill = pal.fill;
    const stroke = selected ? '#2F80C4' : pal.stroke;
    const sw = selected ? 2.4 : (it.type === 'warehouse' || it.type === 'idle' || it.type === 'office' ? 1.8 : 1.1);
    const bb = { x: it.x, y: it.y, w: it.w, h: it.h };
    const clipId = `${uid}-clip-${parkEscape(it.id)}`;
    let extra = '';
    if (it.type === 'stack' && overlay) extra = parkCargoCells(it, theme);
    let handles = '';
    if (interactive && selected) {
      handles += `<rect class="fp-select-box" x="${bb.x - 3}" y="${bb.y - 3}" width="${bb.w + 6}" height="${bb.h + 6}" fill="none" stroke="#2F80C4" stroke-width="1.2" stroke-dasharray="5 3"/>`;
      if (it.type !== 'stamp') {
        const hx = bb.x + bb.w / 2;
        const hy = bb.y - 22;
        handles += `<line class="fp-rotate-arm" x1="${hx}" y1="${bb.y - 3}" x2="${hx}" y2="${hy}" stroke="#2F80C4" stroke-width="1.5"/>
          <circle class="fp-rotate" data-id="${parkEscape(it.id)}" cx="${hx}" cy="${hy}" r="7" fill="#fff" stroke="#2F80C4" stroke-width="2"/>`;
      }
      handles += [[0, 0, 'nw'], [it.w, 0, 'ne'], [0, it.h, 'sw'], [it.w, it.h, 'se']].map(([hx2, hy2, dir]) =>
        `<rect class="fp-handle" data-id="${parkEscape(it.id)}" data-dir="${dir}" x="${it.x + hx2 - 5}" y="${it.y + hy2 - 5}" width="10" height="10" fill="#fff" stroke="#2F80C4" stroke-width="1.5"/>`
      ).join('');
    }
    const dash = it.type === 'stack' ? 'stroke-dasharray="3 2"' : '';
    const labelFill = pal.label;
    const found = it.type === 'stack' ? parkFindStack(it.code) : null;
    let label = it.label || it.code || '';
    if (it.type === 'stack') label = parkStackMapLabel(it);
    else if (it.type === 'warehouse' || it.type === 'idle') label = parkWhInnerLabel(it);
    const hover = it.type === 'stack' && found
      ? `data-wh="${parkEscape(found.wh.id)}" data-code="${parkEscape(it.code)}" data-area="${parkEscape(found.stack.area)}" data-mat="${parkEscape(found.stack.mat)}" data-used="${found.stack.used}" data-cap="${found.stack.cap}" data-batch="${parkEscape(found.stack.batch)}" data-batch-type="${parkEscape(found.stack.batchType || '')}"`
      : '';
    const whMark = (it.type === 'warehouse' || it.type === 'idle')
      ? parkOutsideWhMark(parkWhOutsideText(it), bb, theme === 'cockpit' ? '#9ad8ff' : labelFill, H)
      : '';
    return `<g class="fp-item park-item" data-id="${parkEscape(it.id)}" data-type="${it.type}" ${hover}>
      <defs><clipPath id="${clipId}"><polygon points="${parkPtsAttr(it.pts)}"/></clipPath></defs>
      <polygon points="${parkPtsAttr(it.pts)}" fill="${fill}" fill-opacity="${it.type === 'warehouse' || it.type === 'idle' ? 0.92 : 0.98}" stroke="${stroke}" stroke-width="${sw}" ${dash}/>
      <g clip-path="url(#${clipId})">${extra}${parkItemLabel(label, bb, labelFill, { align: parkLabelAlign(it.type) })}</g>
      ${whMark}
      ${handles}
    </g>`;
  }).join('');

  return `<svg id="${uid}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${bg}"/>
    ${parkGridLinesMarkup(W, H, dims, gridStroke)}
    ${body}
  </svg>`;
}

function parkCurrentPlan() {
  parkApplyGridFromFields();
  const dims = parkGridSize();
  return {
    kind: 'park',
    gridCols: dims.cols,
    gridRows: dims.rows,
    canvasW: parkEditor.canvasW,
    canvasH: parkEditor.canvasH,
    items: parkEditor.items,
    rooms: parkEditor.items.filter((it) => it.type === 'zone').length,
    doors: parkEditor.items.filter((it) => it.type === 'door').length,
    stackGrids: (typeof dumpStackGrids === 'function') ? dumpStackGrids(parkEditor) : {},
    savedAt: new Date().toISOString(),
  };
}

function parkLoadIntoEditor(plan) {
  const src = plan && Array.isArray(plan.items) && plan.items.length ? plan : defaultParkPlan();
  parkEditor.canvasW = Number(src.canvasW) || PARK_W;
  parkEditor.canvasH = Number(src.canvasH) || PARK_H;
  const dims = resolveParkGrid({ ...src, canvasW: parkEditor.canvasW, canvasH: parkEditor.canvasH });
  parkEditor.gridCols = dims.cols;
  parkEditor.gridRows = dims.rows;
  parkEditor.items = src.items.map((it) => {
    const n = parkNormalize({ ...it, pts: (it.pts || []).map((p) => ({ x: p.x, y: p.y })) });
    return parkEnsureTypeFill(n);
  });
  parkEditor.selectedId = null;
  parkEditor.drag = null;
  parkEditor.draw = null;
  parkResetHistory();
  parkSyncGridFields();
}

async function parkFetchJson(url, opts) {
  const res = await fetch(url, { ...opts, headers: { Accept: 'application/json', ...(opts && opts.headers) } });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(res.status === 404 ? '平面图接口 404，请更新并重启 api 后重载' : '平面图接口返回了非 JSON');
  }
  if (!json || json.success === false) {
    throw new Error((json && json.message) || `平面图接口失败 (${res.status})`);
  }
  return json;
}

async function fetchParkPlanFromApi() {
  const json = await parkFetchJson(`${parkApiBase()}/floor-plans`);
  const plans = (json.data && json.data.plans) || {};
  return plans[PARK_ID] || null;
}

async function putParkPlanToApi(plan) {
  const json = await parkFetchJson(`${parkApiBase()}/floor-plans`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: PARK_ID, ...plan }),
  });
  parkCache.plan = { ...plan, savedAt: (json.data && json.data.savedAt) || plan.savedAt };
  return parkCache.plan;
}

function parkSaveLocal(plan) {
  try {
    const raw = localStorage.getItem(PARK_STORAGE_KEY);
    const local = raw ? JSON.parse(raw) : {};
    local[PARK_ID] = plan;
    localStorage.setItem(PARK_STORAGE_KEY, JSON.stringify(local));
  } catch {
    /* ignore */
  }
}

function parkReadLocal() {
  try {
    const raw = localStorage.getItem(PARK_STORAGE_KEY);
    const local = raw ? JSON.parse(raw) : {};
    return local[PARK_ID] || null;
  } catch {
    return null;
  }
}

function parkMergeSavedGrid(plan, fallback) {
  if (!plan || typeof plan !== 'object') return plan;
  const dims = resolveParkGrid({
    ...fallback,
    ...plan,
    canvasW: Number(plan.canvasW) || Number(fallback && fallback.canvasW) || PARK_W,
    canvasH: Number(plan.canvasH) || Number(fallback && fallback.canvasH) || PARK_H,
  });
  plan.gridCols = dims.cols;
  plan.gridRows = dims.rows;
  return plan;
}

async function ensureParkPlanLoaded() {
  if (parkCache.loaded && parkCache.plan) return parkCache.plan;
  if (parkLoadPromise) return parkLoadPromise;
  parkLoadPromise = (async () => {
    const local = parkReadLocal();
    try {
      const remote = await fetchParkPlanFromApi();
      parkCache.plan = remote && remote.items && remote.items.length ? remote : defaultParkPlan();
      parkMergeSavedGrid(parkCache.plan, local);
      (parkCache.plan.items || []).forEach(parkEnsureTypeFill);
      if (remote && remote.kind === 'park') parkSaveLocal(parkCache.plan);
    } catch {
      parkCache.plan = parkMergeSavedGrid(local || defaultParkPlan(), local);
      (parkCache.plan.items || []).forEach(parkEnsureTypeFill);
    }
    parkCache.loaded = true;
    return parkCache.plan;
  })();
  try {
    return await parkLoadPromise;
  } finally {
    parkLoadPromise = null;
  }
}

function getActiveParkPlan() {
  if (parkEditor.items.length) return parkCurrentPlan();
  if (parkCache.plan && parkCache.plan.items && parkCache.plan.items.length) return parkCache.plan;
  return defaultParkPlan();
}

function parkSvgPoint(evt, svg) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  return pt.matrixTransform(ctm.inverse());
}

function parkSyncSideFields() {
  const it = parkSelected();
  const name = document.getElementById('parkItemName');
  const color = document.getElementById('parkItemColor');
  const bindWh = document.getElementById('parkBindWh');
  const bindStack = document.getElementById('parkBindStack');
  const typeHint = document.getElementById('parkTypeHint');
  if (name) {
    name.disabled = !it;
    if (document.activeElement !== name) name.value = it ? (it.label || '') : '';
  }
  if (color) {
    color.disabled = !it || it.type === 'stamp' || it.type === 'stack';
    if (it && it.type !== 'stamp') color.value = parkItemColor(it).slice(0, 7);
  }
  if (bindWh) {
    const show = it && (it.type === 'warehouse' || it.type === 'idle');
    bindWh.parentElement.style.display = show ? '' : 'none';
    if (show) bindWh.value = it.whId || '';
  }
  if (bindStack) {
    const show = it && it.type === 'stack';
    bindStack.parentElement.style.display = show ? '' : 'none';
    if (show) {
      const host = parkEditor.items.find((x) => x.id === it.parentId);
      const wh = (typeof WAREHOUSES !== 'undefined')
        ? WAREHOUSES.find((w) => w.id === host?.whId) || WAREHOUSES[0]
        : null;
      bindStack.innerHTML = (wh?.stacks || []).map((s) => `<option value="${s.code}">${s.code}</option>`).join('');
      bindStack.value = it.code || '';
    }
  }
  if (typeHint) {
    typeHint.textContent = it
      ? `当前：${parkDefaultLabel(it.type, it.kind)}${it.code ? ' · ' + it.code : ''}`
      : '滚轮缩放后可拖拽平移整图；已选中的图形再拖为移动（不改变宽高）。缩放仓库时堆位等内部图形同步缩放。';
  }
}

function applyParkEditorView() {
  const svg = document.getElementById('parkSvg');
  const W = parkEditor.canvasW || PARK_W;
  const H = parkEditor.canvasH || PARK_H;
  const s = Math.min(PARK_ZOOM_MAX, Math.max(PARK_ZOOM_MIN, Number(parkEditorView.scale) || 1));
  parkEditorView.scale = s;
  const vw = W / s;
  const vh = H / s;
  parkEditorView.vx = Math.min(Math.max(0, Number(parkEditorView.vx) || 0), Math.max(0, W - vw));
  parkEditorView.vy = Math.min(Math.max(0, Number(parkEditorView.vy) || 0), Math.max(0, H - vh));
  if (svg) svg.setAttribute('viewBox', `${parkEditorView.vx} ${parkEditorView.vy} ${vw} ${vh}`);
  const wrap = document.getElementById('fpCanvasWrap');
  if (wrap) wrap.classList.toggle('is-zoomed', s > 1.02);
  const lab = document.getElementById('parkZoomLabel');
  if (lab) lab.textContent = `${Math.round(s * 100)}%`;
}

function parkEditorZoomAt(factor, clientX, clientY) {
  const svg = document.getElementById('parkSvg');
  const wrap = document.getElementById('fpCanvasWrap');
  if (!svg || !wrap) return;
  const rect = wrap.getBoundingClientRect();
  const cx = Number.isFinite(clientX) ? clientX : rect.left + rect.width / 2;
  const cy = Number.isFinite(clientY) ? clientY : rect.top + rect.height / 2;
  const evt = { clientX: cx, clientY: cy };
  const anchor = parkSvgPoint(evt, svg);
  const next = Math.min(PARK_ZOOM_MAX, Math.max(PARK_ZOOM_MIN, parkEditorView.scale * factor));
  if (Math.abs(next - parkEditorView.scale) < 0.001) return;
  parkEditorView.scale = next;
  applyParkEditorView();
  const now = parkSvgPoint(evt, svg);
  parkEditorView.vx += anchor.x - now.x;
  parkEditorView.vy += anchor.y - now.y;
  applyParkEditorView();
}

function parkEditorZoom(dir) {
  parkEditorZoomAt(dir > 0 ? 1.2 : 1 / 1.2);
}

function parkEditorZoomReset() {
  parkEditorView.scale = 1;
  parkEditorView.vx = 0;
  parkEditorView.vy = 0;
  applyParkEditorView();
}

function paintParkEditor() {
  const host = document.getElementById('fpCanvas');
  if (!host) return;
  host.innerHTML = renderParkMarkup(parkCurrentPlan(), {
    theme: 'editor',
    interactive: true,
    overlayCargo: false,
    selectedId: parkEditor.selectedId,
    svgId: 'parkSvg',
  });
  applyParkEditorView();
  parkSyncSideFields();
  parkSyncHistoryButtons();
  parkSyncToolButtons();
}

function parkSyncToolButtons() {
  document.querySelectorAll('[data-park-tool]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.parkTool === parkEditor.tool);
  });
  const wrap = document.getElementById('fpCanvasWrap');
  if (wrap) wrap.dataset.tool = parkEditor.tool;
}

function setParkTool(tool) {
  parkEditor.tool = tool || 'select';
  parkEditor.draw = null;
  parkSyncToolButtons();
}

function parkFillWhSelects() {
  const bindWh = document.getElementById('parkBindWh');
  if (!bindWh || typeof WAREHOUSES === 'undefined') return;
  bindWh.innerHTML = '<option value="">未绑定</option>' + WAREHOUSES.map((w) => `<option value="${w.id}">${w.name}</option>`).join('');
}

async function openParkEditor() {
  await ensureParkPlanLoaded();
  if (!parkEditor.ready || !parkEditor.items.length) {
    parkLoadIntoEditor(parkCache.plan);
    parkEditor.ready = true;
  } else {
    parkApplyGridFromFields();
    parkSyncGridFields();
  }
  parkFillWhSelects();
  const snap = document.getElementById('parkSnapToggle');
  if (snap) snap.checked = parkEditor.snap;
  parkEditorZoomReset();
  paintParkEditor();
}

function onParkGridInput() {
  if (!parkApplyGridFromFields()) return;
  paintParkEditor();
}

function onParkGridChange() {
  const before = parkCloneState();
  parkApplyGridFromFields();
  parkSyncGridFields();
  parkCommit(before);
  paintParkEditor();
}

function onParkNameInput() {
  const it = parkSelected();
  const input = document.getElementById('parkItemName');
  if (!it || !input) return;
  it.label = String(input.value || '').slice(0, 20);
  paintParkEditor();
}

function onParkNameFocus() {
  parkEditor.nameBefore = parkCloneState();
}

function onParkNameBlur() {
  const it = parkSelected();
  const input = document.getElementById('parkItemName');
  if (!it || !input) return;
  it.label = (input.value.replace(/\s+/g, ' ').trim() || parkDefaultLabel(it.type, it.kind)).slice(0, 20);
  input.value = it.label;
  if (parkEditor.nameBefore) parkCommit(parkEditor.nameBefore);
  parkEditor.nameBefore = null;
  paintParkEditor();
}

function onParkColorChange() {
  const it = parkSelected();
  const input = document.getElementById('parkItemColor');
  if (!it || !input || it.type === 'stack') return;
  const before = parkCloneState();
  it.color = input.value;
  parkCommit(before);
  paintParkEditor();
}

function onParkBindWhChange() {
  const it = parkSelected();
  const sel = document.getElementById('parkBindWh');
  if (!it || !sel) return;
  const before = parkCloneState();
  it.whId = sel.value || '';
  const wh = (typeof WAREHOUSES !== 'undefined') ? WAREHOUSES.find((w) => w.id === it.whId) : null;
  if (wh) {
    it.whNo = wh.no;
    if (!it.label || /^仓库/.test(it.label) || /仓$/.test(it.label)) it.label = wh.name;
  }
  parkCommit(before);
  paintParkEditor();
}

function onParkBindStackChange() {
  const it = parkSelected();
  const sel = document.getElementById('parkBindStack');
  if (!it || !sel) return;
  const before = parkCloneState();
  it.code = sel.value || '';
  it.label = it.code || '堆位';
  parkCommit(before);
  paintParkEditor();
}

function parkDeleteSelected() {
  const it = parkSelected();
  if (!it) return;
  const before = parkCloneState();
  const drop = new Set([it.id]);
  parkChildren(it.id).forEach((ch) => drop.add(ch.id));
  parkEditor.items = parkEditor.items.filter((x) => !drop.has(x.id));
  parkEditor.selectedId = null;
  parkCommit(before);
  paintParkEditor();
}

async function saveParkPlan() {
  const plan = parkCurrentPlan();
  parkCache.plan = plan;
  parkSaveLocal(plan);
  try {
    await putParkPlanToApi(plan);
    parkCache.loaded = true;
    if (typeof toast === 'function') toast('园区平面图已保存，驾驶舱将按此展示', 'ok');
  } catch (err) {
    if (typeof toast === 'function') toast(err.message || '平面图保存失败，已先写入本地', 'warn');
  }
  if (document.getElementById('app')?.classList.contains('cockpit-mode')) renderParkYard();
}

function parkMinSize(type) {
  if (type === 'door') return { w: 8, h: 14 };
  if (type === 'stamp' || type === 'road' || type === 'bush') {
    const { cellW, cellH } = parkGridSize();
    return { w: cellW, h: cellH };
  }
  return { w: 28, h: 24 };
}

function parkCreateFromRect(tool, x0, y0, x1, y1) {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  const min = parkMinSize(tool);
  if (w < min.w * 0.6 || h < min.h * 0.6) return null;
  const nest = tool === 'line' || tool === 'door' || tool === 'stack';
  const host = nest ? parkHostAt((x0 + x1) / 2, (y0 + y1) / 2) : null;
  if (nest && !host) {
    if (typeof toast === 'function') toast('请在仓库范围内绘制生产线 / 门 / 堆位', 'warn');
    return null;
  }
  const bounds = host ? { x: host.x, y: host.y, w: host.w, h: host.h } : parkCanvasBox();
  const snapped = parkEditor.snap ? parkSnapBox(x, y, w, h, min.w, min.h, bounds) : { x, y, w: Math.max(min.w, w), h: Math.max(min.h, h) };
  const sx = snapped.x;
  const sy = snapped.y;
  const sw = snapped.w;
  const sh = snapped.h;
  const extra = { parentId: host ? host.id : undefined };
  if (tool === 'road' || tool === 'bush') {
    return parkMakeItem('stamp', sx, sy, sw, sh, { kind: tool, label: tool === 'bush' ? '灌木丛' : '道路' });
  }
  if (tool === 'stack' && host) {
    const wh = (typeof WAREHOUSES !== 'undefined') ? WAREHOUSES.find((w) => w.id === host.whId) : null;
    const used = new Set(parkEditor.items.filter((it) => it.type === 'stack').map((it) => it.code));
    const free = (wh?.stacks || []).find((s) => !used.has(s.code));
    extra.code = free?.code || '';
    extra.label = extra.code || '堆位';
    extra.color = '#ffffff';
  }
  if (tool === 'warehouse' || tool === 'idle' || tool === 'office') {
    extra.label = parkDefaultLabel(tool);
  }
  if (tool === 'warehouse') extra.color = parkTypeFill('warehouse');
  if (tool === 'door') extra.color = parkTypeFill('door');
  return parkMakeItem(tool, sx, sy, sw, sh, extra);
}

function onParkPointerDown(e) {
  if (e.target.closest?.('.fp-zoom-bar')) return;
  const svg = document.getElementById('parkSvg');
  if (!svg) return;
  const wrap = document.getElementById('fpCanvasWrap');
  const startPan = () => {
    parkEditorView.pan = { cx: e.clientX, cy: e.clientY };
    if (wrap) wrap.classList.add('is-dragging-pan');
    e.preventDefault();
  };
  if (e.button === 1 || e.button === 2 || parkEditorView.space) {
    startPan();
    return;
  }
  if (e.button !== 0) return;
  const pt = parkSvgPoint(e, svg);
  if (parkEditor.tool !== 'select') {
    parkEditor.draw = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y };
    e.preventDefault();
    return;
  }
  const rotate = e.target.closest?.('.fp-rotate');
  const handle = e.target.closest?.('.fp-handle');
  const item = e.target.closest?.('.fp-item, .park-stamp');
  const before = parkCloneState();
  const zoomed = parkEditorView.scale > 1.02;
  if (rotate) {
    const id = rotate.getAttribute('data-id');
    const it = parkEditor.items.find((x) => x.id === id);
    if (!it) return;
    parkEnsurePts(it);
    const c = parkCentroid(it.pts);
    parkEditor.selectedId = id;
    parkEditor.drag = { mode: 'rotate', id, cx: c.x, cy: c.y, startAng: Math.atan2(pt.y - c.y, pt.x - c.x), pts: it.pts.map((p) => ({ x: p.x, y: p.y })), rot: Number(it.rot) || 0, moved: false, before };
    e.preventDefault();
    paintParkEditor();
    return;
  }
  if (handle) {
    const id = handle.getAttribute('data-id');
    const it = parkEditor.items.find((x) => x.id === id);
    if (!it) return;
    parkEditor.selectedId = id;
    parkEditor.drag = {
      mode: 'resize',
      id,
      dir: handle.getAttribute('data-dir'),
      x: pt.x,
      y: pt.y,
      ox: it.x,
      oy: it.y,
      ow: it.w,
      oh: it.h,
      kidsRel: parkCaptureChildRels(it),
      moved: false,
      before,
    };
    e.preventDefault();
    paintParkEditor();
    return;
  }
  if (item) {
    const id = item.getAttribute('data-id');
    const it = parkEditor.items.find((x) => x.id === id);
    if (!it) return;
    parkEnsurePts(it);
    const wasSelected = parkEditor.selectedId === id;
    parkEditor.selectedId = id;
    if (zoomed && !wasSelected) {
      paintParkEditor();
      startPan();
      return;
    }
    const kids = parkIsHost(it) ? parkChildren(it.id).map((ch) => ({ id: ch.id, pts: ch.pts.map((p) => ({ x: p.x, y: p.y })) })) : [];
    parkEditor.drag = {
      mode: 'move',
      id,
      x: pt.x,
      y: pt.y,
      pts: it.pts.map((p) => ({ x: p.x, y: p.y })),
      ow: it.w,
      oh: it.h,
      kids,
      kidsRel: parkCaptureChildRels(it),
      moved: false,
      before,
    };
    e.preventDefault();
    paintParkEditor();
    return;
  }
  parkEditor.selectedId = null;
  parkEditor.drag = null;
  paintParkEditor();
  startPan();
}

function onParkPointerMove(e) {
  const svg = document.getElementById('parkSvg');
  if (!svg) return;
  if (parkEditorView.pan) {
    const prev = { clientX: parkEditorView.pan.cx, clientY: parkEditorView.pan.cy };
    const p0 = parkSvgPoint(prev, svg);
    const p1 = parkSvgPoint(e, svg);
    parkEditorView.vx -= p1.x - p0.x;
    parkEditorView.vy -= p1.y - p0.y;
    applyParkEditorView();
    parkEditorView.pan.cx = e.clientX;
    parkEditorView.pan.cy = e.clientY;
    e.preventDefault();
    return;
  }
  const pt = parkSvgPoint(e, svg);
  if (parkEditor.draw) {
    parkEditor.draw.x1 = pt.x;
    parkEditor.draw.y1 = pt.y;
    paintParkEditor();
    const d = parkEditor.draw;
    let x = Math.min(d.x0, d.x1);
    let y = Math.min(d.y0, d.y1);
    let w = Math.abs(d.x1 - d.x0);
    let h = Math.abs(d.y1 - d.y0);
    if (parkEditor.snap && !e.shiftKey) {
      const min = parkMinSize(parkEditor.tool);
      const nest = parkEditor.tool === 'line' || parkEditor.tool === 'door' || parkEditor.tool === 'stack';
      const host = nest ? parkHostAt((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2) : null;
      const bounds = host ? { x: host.x, y: host.y, w: host.w, h: host.h } : parkCanvasBox();
      const box = parkSnapBox(x, y, w, h, min.w, min.h, bounds);
      x = box.x; y = box.y; w = box.w; h = box.h;
    }
    const host = document.getElementById('fpCanvas');
    const rubber = host?.querySelector('#parkRubber');
    if (host && !rubber) {
      /* overlay via extra svg rect after paint */
    }
    const svgEl = document.getElementById('parkSvg');
    if (svgEl) {
      let band = svgEl.querySelector('#parkRubber');
      if (!band) {
        band = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        band.id = 'parkRubber';
        band.setAttribute('fill', 'rgba(47,128,196,0.18)');
        band.setAttribute('stroke', '#2F80C4');
        band.setAttribute('stroke-dasharray', '5 3');
        svgEl.appendChild(band);
      }
      band.setAttribute('x', x);
      band.setAttribute('y', y);
      band.setAttribute('width', w);
      band.setAttribute('height', h);
    }
    return;
  }
  if (!parkEditor.drag) return;
  const it = parkEditor.items.find((x) => x.id === parkEditor.drag.id);
  if (!it) return;
  const useSnap = parkEditor.snap && !e.shiftKey;
  if (parkEditor.drag.mode === 'move') {
    const dx = pt.x - parkEditor.drag.x;
    const dy = pt.y - parkEditor.drag.y;
    if (!parkEditor.drag.moved && Math.hypot(dx, dy) < PARK_DRAG_SLOP) return;
    parkEditor.drag.moved = true;
    it.pts = parkEditor.drag.pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    parkTranslate(it, 0, 0);
    if (useSnap) {
      parkApplyBox(it, parkSnapPos(it.x, it.y, parkEditor.drag.ow ?? it.w, parkEditor.drag.oh ?? it.h, parkBoundsFor(it)));
    }
    parkClampToBox(it, parkBoundsFor(it), { keepSize: true });
    if (parkEditor.drag.kidsRel && parkEditor.drag.kidsRel.length) {
      parkLayoutChildren(it, parkEditor.drag.kidsRel);
    } else {
      (parkEditor.drag.kids || []).forEach((k) => {
        const ch = parkEditor.items.find((x) => x.id === k.id);
        if (!ch) return;
        ch.pts = k.pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        parkTranslate(ch, 0, 0);
      });
    }
  } else if (parkEditor.drag.mode === 'rotate') {
    const ang = Math.atan2(pt.y - parkEditor.drag.cy, pt.x - parkEditor.drag.cx);
    let deg = ((ang - parkEditor.drag.startAng) * 180) / Math.PI;
    if (!parkEditor.drag.moved && Math.abs(deg) < 2) return;
    parkEditor.drag.moved = true;
    if (useSnap) deg = Math.round(deg / PARK_ANGLE_SNAP) * PARK_ANGLE_SNAP;
    it.pts = parkEditor.drag.pts.map((p) => ({ x: p.x, y: p.y }));
    it.rot = parkEditor.drag.rot;
    parkRotateAround(it, deg, parkEditor.drag.cx, parkEditor.drag.cy);
    parkClampToBox(it, parkBoundsFor(it));
  } else if (parkEditor.drag.mode === 'resize') {
    const dx = pt.x - parkEditor.drag.x;
    const dy = pt.y - parkEditor.drag.y;
    if (!parkEditor.drag.moved && Math.hypot(dx, dy) < PARK_DRAG_SLOP) return;
    parkEditor.drag.moved = true;
    const min = parkMinSize(it.type === 'stamp' ? it.kind : it.type);
    const dir = parkEditor.drag.dir;
    let x = parkEditor.drag.ox;
    let y = parkEditor.drag.oy;
    let w = parkEditor.drag.ow;
    let h = parkEditor.drag.oh;
    if (dir.includes('e')) w = Math.max(min.w, parkEditor.drag.ow + dx);
    if (dir.includes('s')) h = Math.max(min.h, parkEditor.drag.oh + dy);
    if (dir.includes('w')) {
      w = Math.max(min.w, parkEditor.drag.ow - dx);
      x = parkEditor.drag.ox + (parkEditor.drag.ow - w);
    }
    if (dir.includes('n')) {
      h = Math.max(min.h, parkEditor.drag.oh - dy);
      y = parkEditor.drag.oy + (parkEditor.drag.oh - h);
    }
    if (useSnap) {
      const bounds = parkBoundsFor(it);
      const box = parkSnapBox(x, y, w, h, min.w, min.h, bounds);
      x = box.x; y = box.y; w = box.w; h = box.h;
    }
    it.x = x; it.y = y; it.w = w; it.h = h;
    it.pts = parkRectPts(x, y, w, h);
    parkClampToBox(it, parkBoundsFor(it));
    if (parkEditor.drag.kidsRel && parkEditor.drag.kidsRel.length) {
      parkLayoutChildren(it, parkEditor.drag.kidsRel);
    }
  }
  paintParkEditor();
}

function onParkPointerUp() {
  if (parkEditorView.pan) {
    parkEditorView.pan = null;
    document.getElementById('fpCanvasWrap')?.classList.remove('is-dragging-pan');
    return;
  }
  if (parkEditor.draw) {
    const d = parkEditor.draw;
    parkEditor.draw = null;
    const before = parkCloneState();
    const created = parkCreateFromRect(parkEditor.tool, d.x0, d.y0, d.x1, d.y1);
    if (created) {
      parkSettle(created);
      parkEditor.items.push(created);
      parkEditor.selectedId = created.id;
      parkCommit(before);
      setParkTool('select');
    }
    paintParkEditor();
    return;
  }
  const drag = parkEditor.drag;
  parkEditor.drag = null;
  if (!drag) return;
  const it = parkEditor.items.find((x) => x.id === drag.id);
  if (it && drag.moved) {
    parkSettle(it, { keepSize: drag.mode === 'move', skipKids: !!(drag.kidsRel && drag.kidsRel.length) });
    if (drag.kidsRel && drag.kidsRel.length) {
      parkLayoutChildren(it, drag.kidsRel);
    } else {
      (drag.kids || []).forEach((k) => {
        const ch = parkEditor.items.find((x) => x.id === k.id);
        if (ch) parkSettle(ch, { keepSize: drag.mode === 'move' });
      });
    }
    parkCommit(drag.before);
  } else if (it && !drag.moved && drag.mode === 'move') {
    it.pts = drag.pts.map((p) => ({ x: p.x, y: p.y }));
    parkTranslate(it, 0, 0);
  }
  paintParkEditor();
}

function onParkKeydown(e) {
  if (!parkIsEditorOpen()) return;
  const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (typing) return;
    e.preventDefault();
    if (e.shiftKey) parkRedo();
    else parkUndo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    if (typing) return;
    e.preventDefault();
    parkRedo();
    return;
  }
  if (!typing && (e.key === 'Delete' || e.key === 'Backspace')) {
    e.preventDefault();
    parkDeleteSelected();
    return;
  }
  if (!typing && e.key.toLowerCase() === 'g' && !e.ctrlKey) {
    e.preventDefault();
    parkEditor.snap = !parkEditor.snap;
    const el = document.getElementById('parkSnapToggle');
    if (el) el.checked = parkEditor.snap;
    return;
  }
  if (!typing && (e.key === '+' || e.key === '=')) {
    e.preventDefault();
    parkEditorZoom(1);
    return;
  }
  if (!typing && e.key === '-') {
    e.preventDefault();
    parkEditorZoom(-1);
    return;
  }
  if (!typing && (e.key === '0' || ((e.ctrlKey || e.metaKey) && e.key === '0'))) {
    e.preventDefault();
    parkEditorZoomReset();
    return;
  }
  if (!typing && e.code === 'Space') {
    if (!parkEditorView.space) {
      parkEditorView.space = true;
      document.getElementById('fpCanvasWrap')?.classList.add('is-panning');
    }
    e.preventDefault();
  }
}

function initParkEditor() {
  const wrap = document.getElementById('fpCanvasWrap');
  if (!wrap || wrap.dataset.bound) return;
  wrap.dataset.bound = '1';
  wrap.addEventListener('mousedown', onParkPointerDown);
  wrap.addEventListener('wheel', (e) => {
    if (!parkIsEditorOpen()) return;
    e.preventDefault();
    parkEditorZoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
  }, { passive: false });
  wrap.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (parkEditor.drag || parkEditor.draw || parkEditorView.pan) onParkPointerMove(e);
  });
  window.addEventListener('mouseup', () => {
    if (parkEditor.drag || parkEditor.draw || parkEditorView.pan) onParkPointerUp();
  });
  document.addEventListener('keydown', onParkKeydown);
  document.addEventListener('keyup', (e) => {
    if (e.code !== 'Space') return;
    parkEditorView.space = false;
    const el = document.getElementById('fpCanvasWrap');
    if (el) el.classList.remove('is-panning');
    if (!parkEditorView.pan) el?.classList.remove('is-dragging-pan');
  });
  wrap.addEventListener('dblclick', (e) => {
    if (e.target.closest?.('.fp-zoom-bar')) return;
    const item = e.target.closest?.('.fp-item, .park-stamp');
    if (!item) return;
    parkEditor.selectedId = item.getAttribute('data-id');
    paintParkEditor();
    const input = document.getElementById('parkItemName');
    if (input && !input.disabled) {
      input.focus();
      input.select();
    }
  });
}

function parkBindYardEvents(root) {
  const tip = document.getElementById('ckTip');
  const showTip = (html, e) => {
    if (!tip) return;
    tip.hidden = false;
    tip.innerHTML = html;
    tip.style.left = e.clientX + 14 + 'px';
    tip.style.top = e.clientY + 12 + 'px';
  };
  const moveTip = (e) => {
    if (!tip || tip.hidden) return;
    tip.style.left = e.clientX + 14 + 'px';
    tip.style.top = e.clientY + 12 + 'px';
  };
  const hideTip = () => { if (tip) tip.hidden = true; };

  root.querySelectorAll('.park-cell[data-lot]').forEach((el) => {
    el.addEventListener('mouseenter', (e) => {
      const d = e.currentTarget.dataset;
      showTip(`<b>${parkEscape(d.lot)}</b> · ${d.code || ''}<br/>${parkEscape(d.consignor || '')}${d.consignor && d.kind ? ' · ' : ''}${parkEscape(d.kind || '')}<br/><em>点击查询该票库存</em>`, e);
    });
    el.addEventListener('mousemove', moveTip);
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const lot = e.currentTarget.getAttribute('data-lot');
      if (lot && typeof goInventoryLot === 'function') goInventoryLot(lot);
      else if (typeof go === 'function') go('inventory');
    });
  });

  root.querySelectorAll('[data-code]').forEach((el) => {
    if (el.hasAttribute('data-lot')) return;
    el.addEventListener('mouseenter', (e) => {
      const d = e.currentTarget.dataset;
      if (!tip || !d.code) return;
      const reserved = (typeof getReservedCells === 'function') ? getReservedCells(d.code) : [];
      const resHint = reserved.length ? `<br/>预约占用 ${reserved.length} 格` : '';
      showTip(`<b>${d.code}</b> · ${d.area || ''}<br/>${d.mat || ''}${d.batch && d.batch !== '—' ? `<br/>${d.batch}` : ''}${resHint}<br/>占用 ${d.used || ''}% · 库容 ${d.cap || ''} 吨<br/><em>点击进入堆位管理</em>`, e);
    });
    el.addEventListener('mousemove', moveTip);
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const d = e.currentTarget.dataset;
      if (d.wh && typeof goWarehouse === 'function') goWarehouse(d.wh, d.code);
    });
  });
}

function parkYardLoadingMarkup() {
  return `<div class="yard-plan-loading" role="status" aria-live="polite" aria-label="平面图加载中">
    <div class="yard-plan-loading-vignette"></div>
    <div class="yard-plan-loading-grid"></div>
    <div class="yard-plan-loading-scan"></div>
    <div class="yard-plan-loading-frame">
      <span class="yl-c yl-tl"></span>
      <span class="yl-c yl-tr"></span>
      <span class="yl-c yl-bl"></span>
      <span class="yl-c yl-br"></span>
      <div class="yard-plan-loading-radar" aria-hidden="true">
        <div class="yard-plan-loading-ring"></div>
        <div class="yard-plan-loading-sweep"></div>
        <div class="yard-plan-loading-core"></div>
      </div>
      <div class="yard-plan-loading-copy">
        <span class="yard-plan-loading-kicker">SYS // YARD-MAP</span>
        <strong>平面图同步中</strong>
        <div class="yard-plan-loading-ticks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <em>读取已保存园区布局</em>
      </div>
    </div>
  </div>`;
}

function parkYardHoldThenPaint() {
  if (!parkYardRevealPromise) {
    parkYardRevealPromise = Promise.all([
      Promise.resolve(ensureParkPlanLoaded()).catch(() => {
        if (!parkCache.plan) parkCache.plan = defaultParkPlan();
        parkCache.loaded = true;
      }),
      new Promise((resolve) => setTimeout(resolve, PARK_YARD_LOAD_MIN_MS)),
    ]).then(() => {
      parkYardHoldDone = true;
    });
  }
  parkYardRevealPromise.then(() => {
    if (document.getElementById('yardMap') && document.getElementById('app')?.classList.contains('cockpit-mode')) {
      renderParkYard();
    }
  });
}

function renderParkYard() {
  const root = document.getElementById('yardMap');
  if (!root) return;
  const mapped = !!root.querySelector('#yardPlanStage');
  if (!mapped && !parkYardHoldDone) {
    root.className = 'yard-plan-wrap is-loading';
    if (!root.querySelector('.yard-plan-loading')) root.innerHTML = parkYardLoadingMarkup();
    parkYardHoldThenPaint();
    return;
  }
  const plan = getActiveParkPlan();
  root.className = 'yard-plan-wrap';
  root.innerHTML = `<div class="yard-plan-stage" id="yardPlanStage">${renderParkMarkup(plan, {
    theme: 'cockpit',
    overlayCargo: true,
    svgId: 'yardParkSvg',
  })}</div>`;
  parkBindYardEvents(root);
  initParkYardViewer();
}

function applyParkYardTransform() {
  const stage = document.getElementById('yardPlanStage');
  if (!stage) return;
  stage.style.transform = `translate(${parkYardView.tx}px, ${parkYardView.ty}px) scale(${parkYardView.scale})`;
}

function initParkYardViewer() {
  const root = document.getElementById('yardMap');
  if (!root || root.dataset.panBound) return;
  root.dataset.panBound = '1';
  root.addEventListener('wheel', (e) => {
    e.preventDefault();
    parkYardView.scale = Math.min(2.8, Math.max(0.6, parkYardView.scale + (e.deltaY < 0 ? 0.08 : -0.08)));
    applyParkYardTransform();
  }, { passive: false });
  root.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest?.('[data-code], .park-cell')) return;
    parkYardView.drag = { x: e.clientX, y: e.clientY };
    root.classList.add('is-dragging');
  });
  window.addEventListener('mousemove', (e) => {
    if (!parkYardView.drag) return;
    parkYardView.tx += e.clientX - parkYardView.drag.x;
    parkYardView.ty += e.clientY - parkYardView.drag.y;
    parkYardView.drag.x = e.clientX;
    parkYardView.drag.y = e.clientY;
    applyParkYardTransform();
  });
  window.addEventListener('mouseup', () => {
    parkYardView.drag = null;
    root.classList.remove('is-dragging');
  });
}

window.renderParkYard = renderParkYard;
window.ensureParkPlanLoaded = ensureParkPlanLoaded;
window.openParkEditor = openParkEditor;
window.initParkEditor = initParkEditor;
window.setParkTool = setParkTool;
window.saveParkPlan = saveParkPlan;
window.parkUndo = parkUndo;
window.parkRedo = parkRedo;
window.parkDeleteSelected = parkDeleteSelected;
window.onParkGridChange = onParkGridChange;
window.onParkGridInput = onParkGridInput;
window.onParkNameInput = onParkNameInput;
window.onParkNameFocus = onParkNameFocus;
window.onParkNameBlur = onParkNameBlur;
window.onParkColorChange = onParkColorChange;
window.onParkBindWhChange = onParkBindWhChange;
window.onParkBindStackChange = onParkBindStackChange;
window.defaultParkPlan = defaultParkPlan;
window.parkEditorZoom = parkEditorZoom;
function parkToggleSnap(force) {
  parkEditor.snap = typeof force === 'boolean' ? force : !parkEditor.snap;
  const el = document.getElementById('parkSnapToggle');
  if (el) el.checked = parkEditor.snap;
}

window.parkEditor = parkEditor;
window.parkToggleSnap = parkToggleSnap;
window.getActiveParkPlan = getActiveParkPlan;
window.parkStackGridOf = parkStackGridOf;
window.parkPlanSource = parkPlanSource;
