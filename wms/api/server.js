const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const PORT = Number(process.env.PORT || 3000);

function resolveDataDir() {
  const sibling = path.resolve(path.join(__dirname, '..', 'data'));
  const legacy = path.resolve(path.join(__dirname, 'data'));
  const env = process.env.WMS_DATA_DIR || process.env.ANNO_DATA_DIR;
  if (!env) return sibling;
  const resolved = path.resolve(env);
  if (resolved === legacy) return sibling;
  return resolved;
}

function looksLikeAnnoStore(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (Number(raw.revision) > 0) || (Array.isArray(raw.items) && raw.items.length > 0);
  } catch {
    return false;
  }
}

function looksLikeFloorPlans(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const plans = raw && raw.plans;
    return plans && typeof plans === 'object' && Object.keys(plans).length > 0;
  } catch {
    return false;
  }
}

function migrateLegacyData(dir) {
  const legacy = path.join(__dirname, 'data');
  if (path.resolve(legacy) === path.resolve(dir)) return;
  fs.mkdirSync(dir, { recursive: true });
  [
    ['annotations.json', looksLikeAnnoStore],
    ['floor-plans.json', looksLikeFloorPlans],
  ].forEach(([name, ok]) => {
    const dest = path.join(dir, name);
    const src = path.join(legacy, name);
    if (!fs.existsSync(dest) && fs.existsSync(src) && ok(src)) {
      fs.copyFileSync(src, dest);
    }
  });
}

const DATA_DIR = resolveDataDir();
migrateLegacyData(DATA_DIR);
const DATA_FILE = path.join(DATA_DIR, 'annotations.json');
const FLOOR_PLAN_FILE = path.join(DATA_DIR, 'floor-plans.json');
const PROGRESS_FILE = path.join(DATA_DIR, 'dev-progress.json');

function emptyStore() {
  return { revision: 0, updatedAt: null, items: [] };
}

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(emptyStore(), null, 2), 'utf8');
  }
}

function readStore() {
  ensureStore();
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!raw || typeof raw !== 'object') return emptyStore();
    return {
      revision: Number(raw.revision) || 0,
      updatedAt: raw.updatedAt || null,
      items: Array.isArray(raw.items) ? raw.items : [],
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store) {
  ensureStore();
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

function emptyFloorPlans() {
  return { updatedAt: null, plans: {} };
}

function ensureFloorPlans() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FLOOR_PLAN_FILE)) {
    fs.writeFileSync(FLOOR_PLAN_FILE, JSON.stringify(emptyFloorPlans(), null, 2), 'utf8');
  }
}

function readFloorPlans() {
  ensureFloorPlans();
  try {
    const raw = JSON.parse(fs.readFileSync(FLOOR_PLAN_FILE, 'utf8'));
    if (!raw || typeof raw !== 'object') return emptyFloorPlans();
    return {
      updatedAt: raw.updatedAt || null,
      plans: raw.plans && typeof raw.plans === 'object' ? raw.plans : {},
    };
  } catch {
    return emptyFloorPlans();
  }
}

function writeFloorPlans(store) {
  ensureFloorPlans();
  const tmp = FLOOR_PLAN_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, FLOOR_PLAN_FILE);
}

const PROG_STATUSES = new Set(['未开始', '进行中', '已完成', '阻塞', '不适用']);
const PROG_TRACK_KEYS = ['proto', 'ui', 'fe', 'be', 'integ', 'test'];
const PROG_FIELD_LABELS = {
  proto: '原型设计',
  ui: 'UI设计',
  fe: '前端开发',
  be: '后端开发',
  integ: '前后端对接',
  test: '测试',
  feOwner: '前端负责人',
  beOwner: '后端负责人',
  qaOwner: '测试负责人',
  planDate: '计划完成',
  actualDate: '实际完成',
  block: '阻塞原因',
  note: '备注',
};
const PROG_EDIT_KEYS = Object.keys(PROG_FIELD_LABELS);
const PROG_TEXT_LIMIT = { feOwner: 40, beOwner: 40, qaOwner: 40, block: 500, note: 500 };
const PROG_CAP_RE = /^CAP-\d{3,4}$/;
const PROG_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function progNowCst() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const display = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
  const iso = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
  return { iso, display };
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
  let ip = String(fwd).split(',')[0].trim();
  if (!ip) ip = (req.socket && req.socket.remoteAddress) || '';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip || '未知';
}

function clipText(value, limit) {
  return String(value == null ? '' : value).replace(/\u0000/g, '').trim().slice(0, limit);
}

function emptyProgress() {
  return { revision: 0, updatedAt: null, overrides: {}, logs: [] };
}

function ensureProgress() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PROGRESS_FILE)) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(emptyProgress(), null, 2), 'utf8');
  }
}

function readProgress() {
  ensureProgress();
  try {
    const raw = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    if (!raw || typeof raw !== 'object') return emptyProgress();
    return {
      revision: Number(raw.revision) || 0,
      updatedAt: raw.updatedAt || null,
      overrides: raw.overrides && typeof raw.overrides === 'object' ? raw.overrides : {},
      logs: Array.isArray(raw.logs) ? raw.logs : [],
    };
  } catch {
    return emptyProgress();
  }
}

function writeProgress(store) {
  ensureProgress();
  const tmp = `${PROGRESS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, PROGRESS_FILE);
}

function progressData(req, store) {
  return {
    revision: store.revision,
    updatedAt: store.updatedAt,
    clientIp: clientIp(req),
    overrides: store.overrides,
    logs: store.logs,
  };
}

function putDevProgress(body, ip) {
  if (!body || typeof body !== 'object') return { status: 400, payload: { success: false, data: null, message: 'invalid json' } };
  const capId = String(body.id || '').trim();
  if (!PROG_CAP_RE.test(capId)) return { status: 400, payload: { success: false, data: null, message: '能力编号无效' } };
  const patch = body.patch && typeof body.patch === 'object' ? body.patch : {};
  const before = body.before && typeof body.before === 'object' ? body.before : {};
  const operator = clipText(body.operator || '未知', 40) || '未知';
  const operatorUser = clipText(body.operatorUser, 40);
  const capName = clipText(body.capName, 80);
  const moduleName = clipText(body.module, 40);
  const store = readProgress();
  const prev = store.overrides[capId] && typeof store.overrides[capId] === 'object' ? store.overrides[capId] : {};
  const oldOf = (key) => {
    if (Object.prototype.hasOwnProperty.call(prev, key) && prev[key] != null) return String(prev[key]).trim();
    if (Object.prototype.hasOwnProperty.call(before, key) && before[key] != null) return String(before[key]).trim();
    return '';
  };
  const normalized = {};
  for (const key of PROG_EDIT_KEYS) {
    const raw = Object.prototype.hasOwnProperty.call(patch, key) && patch[key] != null ? patch[key] : oldOf(key);
    if (PROG_TRACK_KEYS.includes(key)) {
      const val = String(raw || '').trim();
      if (!PROG_STATUSES.has(val)) return { status: 400, payload: { success: false, data: null, message: '进度状态不在允许取值内' } };
      normalized[key] = val;
    } else if (key === 'planDate' || key === 'actualDate') {
      const val = String(raw || '').trim();
      if (val && !PROG_DATE_RE.test(val)) return { status: 400, payload: { success: false, data: null, message: '计划完成与实际完成须为日期' } };
      normalized[key] = val;
    } else {
      normalized[key] = clipText(raw, PROG_TEXT_LIMIT[key]);
    }
  }
  if (PROG_TRACK_KEYS.some((key) => normalized[key] === '阻塞') && !normalized.block) {
    return { status: 400, payload: { success: false, data: null, message: '存在阻塞轨道时必须填写阻塞原因' } };
  }
  const changes = [];
  PROG_EDIT_KEYS.forEach((key) => {
    const old = oldOf(key);
    const next = normalized[key];
    if (old !== next) changes.push({ field: PROG_FIELD_LABELS[key], before: old, after: next });
  });
  if (!changes.length) return { status: 400, payload: { success: false, data: null, message: '没有变更' } };
  const { iso, display } = progNowCst();
  const item = {
    ...normalized,
    updatedAt: iso,
    updatedAtDisplay: display,
    updatedBy: operator,
    updatedIp: ip,
  };
  const log = {
    id: `plog-${Date.now()}`,
    at: iso,
    atDisplay: display,
    ip,
    operator,
    operatorUser,
    capId,
    capName,
    module: moduleName,
    changes,
  };
  const logs = [log, ...store.logs.filter((row) => row && typeof row === 'object')].slice(0, 500);
  const overrides = { ...store.overrides, [capId]: item };
  const next = { revision: store.revision + 1, updatedAt: iso, overrides, logs };
  writeProgress(next);
  return {
    status: 200,
    payload: {
      success: true,
      data: { revision: next.revision, updatedAt: iso, clientIp: ip, item, log, logs },
      message: '已记录',
    },
  };
}

function normalizeFloorPlan(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const items = Array.isArray(raw.items) ? raw.items : [];
  if (!items.length) return null;
  const rooms = Number.isFinite(Number(raw.rooms)) ? Math.max(0, Math.min(200, Math.round(Number(raw.rooms)))) : items.filter((it) => it && (it.type === 'room' || it.type === 'zone')).length;
  const doors = Number.isFinite(Number(raw.doors)) ? Math.max(0, Math.min(200, Math.round(Number(raw.doors)))) : items.filter((it) => it && it.type === 'door').length;
  const plan = {
    rooms,
    doors,
    items,
    savedAt: String(raw.savedAt || new Date().toISOString()),
  };
  if (raw.kind) plan.kind = String(raw.kind);
  const grid = Number(raw.grid);
  if (Number.isFinite(grid)) plan.grid = Math.max(8, Math.min(80, Math.round(grid)));
  const gridCols = Number(raw.gridCols);
  const gridRows = Number(raw.gridRows);
  if (Number.isFinite(gridCols)) plan.gridCols = Math.max(2, Math.min(200, Math.round(gridCols)));
  if (Number.isFinite(gridRows)) plan.gridRows = Math.max(2, Math.min(200, Math.round(gridRows)));
  const canvasW = Number(raw.canvasW);
  const canvasH = Number(raw.canvasH);
  if (Number.isFinite(canvasW)) plan.canvasW = Math.max(400, Math.min(8000, Math.round(canvasW)));
  if (Number.isFinite(canvasH)) plan.canvasH = Math.max(300, Math.min(8000, Math.round(canvasH)));
  if (raw.stackGrids && typeof raw.stackGrids === 'object') plan.stackGrids = raw.stackGrids;
  return plan;
}

function normalizeItem(raw, idx) {
  if (!raw || typeof raw !== 'object') return null;
  const text = String(raw.text || '').trim();
  const pageId = String(raw.pageId || '').trim();
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!text || !pageId || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const now = new Date().toISOString();
  return {
    id: String(raw.id || '').trim() || `anno-server-${Date.now().toString(36)}-${idx}`,
    pageId,
    x: Math.min(100, Math.max(0, x)),
    y: Math.min(100, Math.max(0, y)),
    text,
    author: String(raw.author || '远程用户'),
    resolved: Boolean(raw.resolved),
    createdAt: String(raw.createdAt || now),
    updatedAt: String(raw.updatedAt || now),
  };
}

/** 按 id 合并：updatedAt 较新者胜；client 全量列表中缺失且 baseRevision 匹配时视为删除 */
function mergeAnnotations(serverItems, clientItems, baseRevision, serverRevision) {
  const out = new Map();

  if (baseRevision === serverRevision) {
    clientItems.forEach((it) => out.set(it.id, it));
    return [...out.values()];
  }

  serverItems.forEach((it) => out.set(it.id, it));
  clientItems.forEach((it) => {
    const prev = out.get(it.id);
    if (!prev || String(it.updatedAt || '') >= String(prev.updatedAt || '')) {
      out.set(it.id, it);
    }
  });

  clientItems.forEach((it) => {
    if (it && it._deleted && it.id) out.delete(it.id);
  });

  return [...out.values()];
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { ok: true }, message: 'ok' });
});

app.get('/api/dev-progress', (req, res) => {
  const store = readProgress();
  res.json({ success: true, data: progressData(req, store), message: 'ok' });
});

app.put('/api/dev-progress', (req, res) => {
  const result = putDevProgress(req.body || {}, clientIp(req));
  res.status(result.status).json(result.payload);
});

app.get('/api/annotations', (_req, res) => {
  const store = readStore();
  res.json({
    success: true,
    data: {
      revision: store.revision,
      updatedAt: store.updatedAt,
      items: store.items,
    },
    message: 'ok',
  });
});

app.put('/api/annotations', (req, res) => {
  const body = req.body || {};
  const list = Array.isArray(body.items) ? body.items : null;
  if (!list) {
    return res.status(400).json({ success: false, data: null, message: 'items 须为数组' });
  }

  const normalized = list.map(normalizeItem).filter(Boolean);
  const deletedIds = Array.isArray(body.deletedIds)
    ? body.deletedIds.map(String)
    : [];
  const baseRevision = body.baseRevision != null ? Number(body.baseRevision) : null;

  const store = readStore();
  let nextItems;

  if (baseRevision === store.revision) {
    nextItems = normalized.filter((it) => !deletedIds.includes(it.id));
  } else {
    nextItems = mergeAnnotations(store.items, normalized, baseRevision, store.revision);
    deletedIds.forEach((id) => {
      nextItems = nextItems.filter((it) => it.id !== id);
    });
  }

  const next = {
    revision: store.revision + 1,
    updatedAt: new Date().toISOString(),
    items: nextItems,
  };
  writeStore(next);

  res.json({
    success: true,
    data: {
      revision: next.revision,
      updatedAt: next.updatedAt,
      items: next.items,
      merged: baseRevision !== store.revision,
    },
    message: baseRevision === store.revision ? '已保存' : '已合并保存',
  });
});

app.delete('/api/annotations', (_req, res) => {
  const next = {
    revision: readStore().revision + 1,
    updatedAt: new Date().toISOString(),
    items: [],
  };
  writeStore(next);
  res.json({
    success: true,
    data: { revision: next.revision, updatedAt: next.updatedAt, items: [] },
    message: '已清空',
  });
});

function saveFloorPlanBody(req, res) {
  const id = String((req.body && (req.body.id || req.body.whId)) || '').trim();
  if (!id) {
    return res.status(400).json({ success: false, data: null, message: '平面图编号无效' });
  }
  const plan = normalizeFloorPlan(req.body);
  if (!plan) {
    return res.status(400).json({ success: false, data: null, message: '平面图须包含 items' });
  }
  const store = readFloorPlans();
  store.plans[id] = plan;
  store.updatedAt = plan.savedAt;
  writeFloorPlans(store);
  res.json({ success: true, data: plan, message: '已保存' });
}

app.get('/api/floor-plans', (_req, res) => {
  const store = readFloorPlans();
  res.json({
    success: true,
    data: { updatedAt: store.updatedAt, plans: store.plans },
    message: 'ok',
  });
});
app.get('/api/floorplans', (_req, res) => {
  const store = readFloorPlans();
  res.json({
    success: true,
    data: { updatedAt: store.updatedAt, plans: store.plans },
    message: 'ok',
  });
});

app.put('/api/floor-plans', saveFloorPlanBody);
app.put('/api/floorplans', saveFloorPlanBody);

app.get('/api/warehouses/:id/floor-plan', (req, res) => {
  const id = String(req.params.id || '').trim();
  const plan = readFloorPlans().plans[id] || null;
  res.json({
    success: true,
    data: plan,
    message: plan ? 'ok' : '未设置',
  });
});

app.put('/api/warehouses/:id/floor-plan', (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    return res.status(400).json({ success: false, data: null, message: '平面图编号无效' });
  }
  const plan = normalizeFloorPlan(req.body);
  if (!plan) {
    return res.status(400).json({ success: false, data: null, message: '平面图须包含 items' });
  }
  const store = readFloorPlans();
  store.plans[id] = plan;
  store.updatedAt = plan.savedAt;
  writeFloorPlans(store);
  res.json({
    success: true,
    data: plan,
    message: '已保存',
  });
});

ensureStore();
ensureFloorPlans();
ensureProgress();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[wms-anno-api] listening on :${PORT}, data=${DATA_FILE}, floorPlans=${FLOOR_PLAN_FILE}`);
});
