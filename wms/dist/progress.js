/* 开发进度跟踪：能力基线来自 progress-seed.js，提交写入 /api/dev-progress */
const PROG_STATUSES = ['未开始', '进行中', '已完成', '阻塞', '不适用'];
const PROG_TRACKS = [
  { key: 'proto', label: '原型设计' },
  { key: 'ui', label: 'UI设计' },
  { key: 'fe', label: '前端开发' },
  { key: 'be', label: '后端开发' },
  { key: 'integ', label: '前后端对接' },
  { key: 'test', label: '测试' },
];
const PROG_EDIT_KEYS = [
  'proto', 'ui', 'fe', 'be', 'integ', 'test',
  'feOwner', 'beOwner', 'qaOwner', 'planDate', 'actualDate', 'block', 'note',
];
const PROG_FIELD_LABEL = {
  proto: '原型设计', ui: 'UI设计', fe: '前端开发', be: '后端开发',
  integ: '前后端对接', test: '测试', feOwner: '前端负责人', beOwner: '后端负责人',
  qaOwner: '测试负责人', planDate: '计划完成', actualDate: '实际完成', block: '阻塞原因', note: '备注',
};
const PROG_STAGE_ORDER = ['阻塞', '未开始', '原型中', 'UI设计中', '待开发', '开发中', '对接中', '测试中', '已完成'];
const PROG_STAGE_COLOR = {
  未开始: '#C5CED8',
  原型中: '#7BA3D0',
  UI设计中: '#5B8DEF',
  待开发: '#8AA0B8',
  开发中: '#2F80C4',
  对接中: '#1B4F8A',
  测试中: '#C47A12',
  已完成: '#2E7D4F',
  阻塞: '#B42318',
};
const PROG_NODE_DAY = { D5: 5, D10: 10, D20: 20, D26: 26, D30: 30, D45: 45, D52: 52, D55: 55 };
const PROG_BATCH_START = { 启动: 0, 第一批: 5, 第二批: 10, 第三批: 20, 第四批: 26, 第五批: 30 };
const PROG_BATCH_ORDER = ['启动', '第一批', '第二批', '第三批', '第四批', '第五批'];
const PROG_NODE_ORDER = ['D5', 'D10', 'D20', 'D26', 'D30', 'D45', 'D52', 'D55'];
const PROG_LS_KEY = 'wms_dev_progress_v1';
const PROG_ANCHOR_KEY = 'wms_prog_anchor';

const progState = {
  overrides: {},
  logs: [],
  revision: 0,
  clientIp: '',
  sync: 'loading',
  page: 1,
  saving: false,
};

function progApiBase() {
  const host = location.hostname;
  if (host === 'wms.skd.wang') return '';
  if (host === 'localhost' || host === '127.0.0.1' || location.protocol === 'file:') return 'http://127.0.0.1:3000';
  return 'http://wms.skd.wang';
}

function progDoneOrNa(v) {
  return v === '已完成' || v === '不适用';
}

function computeStage(it) {
  const tracks = [it.proto, it.ui, it.fe, it.be, it.integ, it.test];
  if (tracks.some((v) => v === '阻塞')) return '阻塞';
  if (tracks.every(progDoneOrNa)) return '已完成';
  const devTouched = it.fe === '已完成' || it.be === '已完成' || it.integ === '已完成';
  if (it.test === '进行中' || (progDoneOrNa(it.fe) && progDoneOrNa(it.be) && progDoneOrNa(it.integ) && !progDoneOrNa(it.test) && devTouched)) return '测试中';
  if (it.integ === '进行中' || (progDoneOrNa(it.fe) && progDoneOrNa(it.be) && !progDoneOrNa(it.integ) && (it.fe === '已完成' || it.be === '已完成'))) return '对接中';
  if (it.fe === '进行中' || it.fe === '已完成' || it.be === '进行中' || it.be === '已完成') return '开发中';
  if (progDoneOrNa(it.proto) && progDoneOrNa(it.ui)) return '待开发';
  if (it.ui === '进行中') return 'UI设计中';
  if (it.proto === '进行中' || it.proto === '已完成') return '原型中';
  return '未开始';
}

function trackScore(v) {
  if (v === '已完成') return 1;
  if (v === '进行中') return 0.5;
  if (v === '阻塞') return 0.2;
  return 0;
}

function progressRatio(it) {
  let sum = 0;
  let n = 0;
  PROG_TRACKS.forEach((t) => {
    const v = it[t.key];
    if (v === '不适用') return;
    n += 1;
    sum += trackScore(v);
  });
  return n ? sum / n : 0;
}

function mergeProgItem(seed) {
  const over = progState.overrides[seed.id] || {};
  const item = { ...seed };
  PROG_EDIT_KEYS.forEach((k) => {
    if (over[k] != null && over[k] !== '') item[k] = over[k];
    else if (over[k] === '') item[k] = '';
  });
  item.updatedAt = over.updatedAt || '';
  item.updatedAtDisplay = over.updatedAtDisplay || '';
  item.updatedBy = over.updatedBy || '';
  item.updatedIp = over.updatedIp || '';
  item.stage = computeStage(item);
  item.ratio = progressRatio(item);
  return item;
}

function allProgItems() {
  return (window.PROGRESS_SEED || []).map(mergeProgItem);
}

function progVal(id) {
  return document.getElementById(id)?.value || '';
}

function progFilterActive() {
  return ['progQ', 'progModule', 'progBatch', 'progStage', 'progPri', 'progNode'].some((id) => progVal(id).trim());
}

function progFiltered() {
  const q = progVal('progQ').trim().toLowerCase();
  const module = progVal('progModule');
  const batch = progVal('progBatch');
  const stage = progVal('progStage');
  const pri = progVal('progPri');
  const node = progVal('progNode');
  return allProgItems().filter((it) => {
    if (module && it.module !== module) return false;
    if (batch && it.batch !== batch) return false;
    if (stage && it.stage !== stage) return false;
    if (pri && it.pri !== pri) return false;
    if (node && it.node !== node) return false;
    if (q) {
      const blob = [it.id, it.name, it.module, it.page, it.desc, it.api, it.note].join(' ').toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

function progAnchor() {
  return progVal('progAnchor') || '2026-10-01';
}

function fmtProgTime(v) {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function pctText(n) {
  return `${Math.round(n * 100)}%`;
}

function stageTag(stage) {
  const cls = stage === '已完成' ? 'tag-green'
    : stage === '阻塞' ? 'tag-red'
      : stage === '测试中' ? 'tag-orange'
        : (stage === '开发中' || stage === '对接中' || stage === '原型中' || stage === 'UI设计中') ? 'tag-blue'
          : 'tag-gray';
  return `<span class="tag ${cls}">${escapeHtml(stage)}</span>`;
}

function trackDots(it) {
  return `<span class="pg-dots">${PROG_TRACKS.map((t) => {
    const v = it[t.key] || '未开始';
    return `<i class="pg-dot" data-st="${escapeHtml(v)}" title="${escapeHtml(t.label)}：${escapeHtml(v)}"></i>`;
  }).join('')}</span>`;
}

function uniqKeep(list, key) {
  const out = [];
  list.forEach((it) => {
    if (it[key] && !out.includes(it[key])) out.push(it[key]);
  });
  return out;
}

function fillProgSelect(id, values) {
  const el = document.getElementById(id);
  if (!el) return;
  const cur = el.value;
  el.innerHTML = `<option value="">全部</option>${values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}`;
  if ([...el.options].some((o) => o.value === cur)) el.value = cur;
}

function bindProgOnce() {
  if (bindProgOnce.done) return;
  bindProgOnce.done = true;
  document.getElementById('progGantt')?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-gantt-key]');
    if (!row) return;
    progGanttActivate(row.dataset.ganttKey);
  });
  document.getElementById('progTable')?.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-prog-edit]');
    if (edit) {
      openProgModal(edit.dataset.progEdit);
      return;
    }
    const pageBtn = e.target.closest('[data-prog-page]');
    if (pageBtn) {
      progState.page = Number(pageBtn.dataset.progPage) || 1;
      progRenderTable();
    }
  });
  window.addEventListener('resize', () => {
    if (!document.querySelector('.page[data-page="progress"].active')) return;
    clearTimeout(bindProgOnce.resizeTimer);
    bindProgOnce.resizeTimer = setTimeout(progRenderCharts, 120);
  });
}

function ensureProgChrome() {
  if (ensureProgChrome.done) return;
  ensureProgChrome.done = true;
  const seed = window.PROGRESS_SEED || [];
  fillProgSelect('progModule', uniqKeep(seed, 'module'));
  fillProgSelect('progBatch', PROG_BATCH_ORDER.filter((b) => seed.some((s) => s.batch === b)));
  fillProgSelect('progStage', PROG_STAGE_ORDER);
  const pris = uniqKeep(seed, 'pri').sort();
  fillProgSelect('progPri', pris);
  fillProgSelect('progNode', PROG_NODE_ORDER.filter((n) => seed.some((s) => s.node === n)));
  const anchorEl = document.getElementById('progAnchor');
  if (anchorEl && !anchorEl.value) anchorEl.value = localStorage.getItem(PROG_ANCHOR_KEY) || '2026-10-01';
  bindProgOnce();
}

function persistProgLocal() {
  localStorage.setItem(PROG_LS_KEY, JSON.stringify({
    revision: progState.revision,
    overrides: progState.overrides,
    logs: progState.logs,
  }));
}

function readProgLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROG_LS_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return null;
    return raw;
  } catch {
    return null;
  }
}

function applyProgLocal() {
  const local = readProgLocal();
  if (!local) return;
  progState.overrides = local.overrides || {};
  progState.logs = Array.isArray(local.logs) ? local.logs : [];
  progState.revision = Number(local.revision) || 0;
}

async function refreshProgress() {
  try {
    const res = await fetch(`${progApiBase()}/api/dev-progress`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const body = await res.json();
    if (!body.success || !body.data) throw new Error(body.message || '读取失败');
    progState.overrides = body.data.overrides || {};
    progState.logs = Array.isArray(body.data.logs) ? body.data.logs : [];
    progState.revision = Number(body.data.revision) || 0;
    progState.clientIp = body.data.clientIp || '';
    progState.sync = 'ok';
    persistProgLocal();
  } catch {
    applyProgLocal();
    progState.sync = 'local';
    progState.clientIp = '';
  }
  if (document.querySelector('.page[data-page="progress"].active')) progRender();
}

function renderProgressPage() {
  ensureProgChrome();
  progRender();
  refreshProgress();
}

function progOnFilter() {
  progState.page = 1;
  progRender();
}

function progOnAnchor() {
  const v = progVal('progAnchor');
  if (v) localStorage.setItem(PROG_ANCHOR_KEY, v);
  progRenderCharts();
}

function progRender() {
  progRenderKpis();
  progRenderCharts();
  progRenderTable();
  progRenderLogs();
  const sync = document.getElementById('progSync');
  if (sync) {
    sync.textContent = progState.sync === 'ok'
      ? `已连接 · 来源 IP ${progState.clientIp || '—'}`
      : progState.sync === 'loading'
        ? '正在同步…'
        : '未连接进度服务 · 提交暂存本机，来源 IP 无法记录';
  }
}

function trackStat(items, key) {
  let done = 0;
  let applicable = 0;
  items.forEach((it) => {
    if (it[key] === '不适用') return;
    applicable += 1;
    if (it[key] === '已完成') done += 1;
  });
  return { done, applicable, rate: applicable ? done / applicable : 0 };
}

function progRenderKpis() {
  const el = document.getElementById('progKpis');
  if (!el) return;
  const items = progFiltered();
  const cards = PROG_TRACKS.map((t) => {
    const st = trackStat(items, t.key);
    const cls = st.rate >= 1 ? 'ok' : st.rate > 0 ? '' : '';
    return `<div class="stat-card ${cls}"><div class="label">${escapeHtml(t.label)}</div><div class="value">${pctText(st.rate)}</div><div class="sub">${st.done} 已完成 / ${st.applicable} 适用</div></div>`;
  }).join('');
  const stageCounts = {};
  items.forEach((it) => { stageCounts[it.stage] = (stageCounts[it.stage] || 0) + 1; });
  const chips = PROG_STAGE_ORDER.filter((s) => stageCounts[s]).map((s) => `<span class="pg-chip">${escapeHtml(s)} <b>${stageCounts[s]}</b></span>`).join('');
  el.innerHTML = `<div class="pg-kpis">${cards}</div><div class="pg-stage-line">${chips}<span class="pg-chip">当前 <b>${items.length}</b> 条</span></div>`;
}

function progRenderCharts() {
  const items = progFiltered();
  progRenderGantt(items);
  progRenderBar(document.getElementById('progBarA'), progVal('progBarDimA') || 'stage', items);
  progRenderBar(document.getElementById('progBarB'), progVal('progBarDimB') || 'module', items);
}

function batchStartDay(it) {
  return PROG_BATCH_START[it.batch] ?? 0;
}

function nodeEndDay(it) {
  const end = PROG_NODE_DAY[it.node] ?? 55;
  return Math.max(end, batchStartDay(it) + 1);
}

function dayOffset(iso, anchor) {
  if (!iso) return null;
  const a = new Date(`${anchor}T00:00:00`);
  const b = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function localTodayOffset(anchor) {
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return dayOffset(iso, anchor);
}

function moduleOrder() {
  return uniqKeep(window.PROGRESS_SEED || [], 'module');
}

function majorityStage(list) {
  const counts = {};
  list.forEach((it) => { counts[it.stage] = (counts[it.stage] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || PROG_STAGE_ORDER.indexOf(a[0]) - PROG_STAGE_ORDER.indexOf(b[0]))[0][0];
}

function ganttRows(items, dim, anchor) {
  if (dim === 'cap') {
    return items.map((it) => ({
      key: it.id,
      label: `${it.id} ${it.name}`,
      start: batchStartDay(it),
      end: nodeEndDay(it),
      ratio: it.ratio,
      stage: it.stage,
      planDay: dayOffset(it.planDate, anchor),
      actualDay: dayOffset(it.actualDate, anchor),
    }));
  }
  const groups = new Map();
  items.forEach((it) => {
    const key = dim === 'batch' ? it.batch : dim === 'node' ? it.node : it.module;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  });
  const order = dim === 'batch' ? PROG_BATCH_ORDER : dim === 'node' ? PROG_NODE_ORDER : moduleOrder();
  const keys = [...groups.keys()].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, 'zh');
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return keys.map((key) => {
    const list = groups.get(key);
    const start = Math.min(...list.map(batchStartDay));
    const end = Math.max(...list.map(nodeEndDay));
    const ratio = list.reduce((s, it) => s + it.ratio, 0) / list.length;
    return {
      key,
      label: `${key}（${list.length}）`,
      start,
      end: Math.max(end, start + 1),
      ratio,
      stage: majorityStage(list),
      planDay: null,
      actualDay: null,
    };
  });
}

function cutText(s, n) {
  const chars = Array.from(s || '');
  if (chars.length <= n) return chars.join('');
  return `${chars.slice(0, n).join('')}…`;
}

function progRenderGantt(items) {
  const el = document.getElementById('progGantt');
  if (!el) return;
  const dim = progVal('progGanttDim') || 'module';
  const anchor = progAnchor();
  const rows = ganttRows(items, dim, anchor);
  if (!rows.length) {
    el.innerHTML = '<div class="empty">当前筛选下没有能力</div>';
    return;
  }
  let min = 0;
  let max = 55;
  rows.forEach((row) => {
    min = Math.min(min, row.start, row.planDay ?? row.start, row.actualDay ?? row.start);
    max = Math.max(max, row.end, row.planDay ?? row.end, row.actualDay ?? row.end);
  });
  const today = localTodayOffset(anchor);
  if (today != null) {
    min = Math.min(min, today);
    max = Math.max(max, today);
  }
  if (max <= min) max = min + 1;
  const labelW = 168;
  const padR = 46;
  const W = 980;
  const rowH = 34;
  const headH = 36;
  const plotX = labelW;
  const plotW = W - labelW - padR;
  const H = headH + rows.length * rowH + 8;
  const xOf = (day) => plotX + ((day - min) / (max - min)) * plotW;
  const ticks = Object.entries(PROG_NODE_DAY).filter(([, day]) => day >= min - 1 && day <= max + 1);
  const parts = [];
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"></rect>`);
  ticks.forEach(([name, day]) => {
    const x = xOf(day);
    parts.push(`<line x1="${x}" y1="${headH - 4}" x2="${x}" y2="${H}" stroke="#E6EBF2"></line>`);
    parts.push(`<text x="${x}" y="16" text-anchor="middle" font-size="11" fill="#5A6A7E" title="${escapeHtml(name)} · 签订后第 ${day} 天">${escapeHtml(name)}</text>`);
  });
  if (today != null && today >= min && today <= max) {
    const x = xOf(today);
    parts.push(`<line x1="${x}" y1="${headH - 4}" x2="${x}" y2="${H}" stroke="#C47A12" stroke-dasharray="3 3"></line>`);
    parts.push(`<text x="${x + 4}" y="28" font-size="10" fill="#C47A12">今天</text>`);
  }
  rows.forEach((row, i) => {
    const y = headH + i * rowH;
    const yMid = y + rowH / 2;
    const x1 = xOf(row.start);
    const x2 = xOf(row.end);
    const barW = Math.max(6, x2 - x1);
    const fillW = Math.max(0, barW * Math.min(1, row.ratio));
    const color = PROG_STAGE_COLOR[row.stage] || '#1B4F8A';
    const tip = `${row.label} · ${row.stage} · 完成度 ${pctText(row.ratio)}`;
    parts.push(`<g class="pg-grow" data-gantt-key="${escapeHtml(row.key)}">`);
    parts.push(`<rect class="pg-row-bg" x="0" y="${y}" width="${W}" height="${rowH}" fill="transparent"></rect>`);
    parts.push(`<text x="8" y="${yMid + 4}" font-size="12" fill="#1A2332" title="${escapeHtml(tip)}">${escapeHtml(cutText(row.label, 12))}</text>`);
    parts.push(`<rect x="${x1}" y="${yMid - 7}" width="${barW}" height="14" rx="3" fill="${color}" opacity="0.22"></rect>`);
    parts.push(`<rect x="${x1}" y="${yMid - 7}" width="${fillW}" height="14" rx="3" fill="${color}" title="${escapeHtml(tip)}"></rect>`);
    if (row.planDay != null) {
      const px = xOf(row.planDay);
      parts.push(`<polygon points="${px},${yMid - 6} ${px + 5},${yMid} ${px},${yMid + 6} ${px - 5},${yMid}" fill="#1B4F8A" title="计划完成"></polygon>`);
    }
    if (row.actualDay != null) {
      const ax = xOf(row.actualDay);
      parts.push(`<polygon points="${ax},${yMid - 6} ${ax + 5},${yMid} ${ax},${yMid + 6} ${ax - 5},${yMid}" fill="#2E7D4F" title="实际完成"></polygon>`);
    }
    parts.push(`<text x="${W - 8}" y="${yMid + 4}" text-anchor="end" font-size="11" fill="#5A6A7E">${pctText(row.ratio)}</text>`);
    parts.push('</g>');
  });
  const legend = `<div class="pg-legend"><span><i style="background:#1B4F8A"></i>计划完成</span><span><i style="background:#2E7D4F"></i>实际完成</span><span><i style="background:#C47A12"></i>今天</span><span>浅色为合同窗口，深色为六轨完成度。点击行可下钻或更新。</span></div>`;
  el.innerHTML = `<div class="pg-gantt-scroll"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="开发进度甘特图">${parts.join('')}</svg></div>${legend}`;
}

function progGanttActivate(key) {
  const dim = progVal('progGanttDim') || 'module';
  if (dim === 'cap') {
    openProgModal(key);
    return;
  }
  const map = { module: 'progModule', batch: 'progBatch', node: 'progNode' };
  const id = map[dim];
  const el = document.getElementById(id);
  if (!el) return;
  el.value = el.value === key ? '' : key;
  progOnFilter();
}

function barRows(items, kind) {
  if (kind === 'track') {
    return PROG_TRACKS.map((t) => {
      const st = trackStat(items, t.key);
      return { label: t.label, total: st.rate, text: `${st.done}/${st.applicable}`, segments: [{ color: '#1B4F8A', value: st.rate }] };
    });
  }
  if (kind === 'stage') {
    const counts = {};
    items.forEach((it) => { counts[it.stage] = (counts[it.stage] || 0) + 1; });
    return PROG_STAGE_ORDER.filter((s) => counts[s]).map((s) => ({
      label: s,
      total: counts[s],
      text: String(counts[s]),
      segments: [{ color: PROG_STAGE_COLOR[s], value: counts[s] }],
    }));
  }
  const keyOf = {
    module: (it) => it.module,
    batch: (it) => it.batch,
    pri: (it) => it.pri,
    node: (it) => it.node,
    page: (it) => it.page,
  }[kind] || ((it) => it.module);
  const order = kind === 'batch' ? PROG_BATCH_ORDER
    : kind === 'node' ? PROG_NODE_ORDER
      : kind === 'module' ? moduleOrder()
        : kind === 'pri' ? ['P0', 'P1', 'P2']
          : null;
  const groups = new Map();
  items.forEach((it) => {
    const k = keyOf(it) || '—';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  });
  const keys = [...groups.keys()].sort((a, b) => {
    if (!order) return groups.get(b).length - groups.get(a).length;
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, 'zh');
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return keys.map((k) => {
    const list = groups.get(k);
    const segments = PROG_STAGE_ORDER.map((s) => ({
      color: PROG_STAGE_COLOR[s],
      value: list.filter((it) => it.stage === s).length,
      stage: s,
    })).filter((seg) => seg.value > 0);
    return { label: k, total: list.length, text: String(list.length), segments };
  });
}

function progRenderBar(el, kind, items) {
  if (!el) return;
  const rows = barRows(items, kind);
  if (!rows.length) {
    el.innerHTML = '<div class="empty">当前筛选下没有能力</div>';
    return;
  }
  const rateMode = kind === 'track';
  const max = rateMode ? 1 : Math.max(...rows.map((r) => r.total), 1);
  const labelW = 92;
  const padR = 52;
  const W = 640;
  const rowH = 28;
  const H = rows.length * rowH + 8;
  const plotX = labelW;
  const plotW = W - labelW - padR;
  const parts = [`<rect width="${W}" height="${H}" fill="#fff"></rect>`];
  rows.forEach((row, i) => {
    const y = 6 + i * rowH;
    parts.push(`<text x="0" y="${y + 14}" font-size="12" fill="#1A2332" title="${escapeHtml(row.label)}">${escapeHtml(cutText(row.label, 8))}</text>`);
    parts.push(`<rect x="${plotX}" y="${y}" width="${plotW}" height="16" rx="3" fill="#EEF2F6"></rect>`);
    let acc = 0;
    row.segments.forEach((seg) => {
      const w = (seg.value / max) * plotW;
      if (w <= 0) return;
      const title = seg.stage ? `${row.label} · ${seg.stage} ${seg.value}` : `${row.label} ${row.text}`;
      parts.push(`<rect x="${plotX + acc}" y="${y}" width="${Math.max(w, 1)}" height="16" rx="2" fill="${seg.color}" title="${escapeHtml(title)}"></rect>`);
      acc += w;
    });
    const right = rateMode ? pctText(row.total) : row.text;
    parts.push(`<text x="${W - 4}" y="${y + 13}" text-anchor="end" font-size="11" fill="#5A6A7E">${escapeHtml(right)}</text>`);
  });
  const stages = new Set();
  rows.forEach((row) => row.segments.forEach((seg) => { if (seg.stage) stages.add(seg.stage); }));
  const legend = stages.size
    ? `<div class="pg-legend">${[...stages].map((s) => `<span><i style="background:${PROG_STAGE_COLOR[s]}"></i>${escapeHtml(s)}</span>`).join('')}</div>`
    : '';
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="进度柱状图">${parts.join('')}</svg>${legend}`;
}

function progRenderTable() {
  const el = document.getElementById('progTable');
  if (!el) return;
  const items = progFiltered();
  const size = 10;
  const pages = Math.max(1, Math.ceil(items.length / size));
  if (progState.page > pages) progState.page = pages;
  if (progState.page < 1) progState.page = 1;
  const start = (progState.page - 1) * size;
  const pageItems = items.slice(start, start + size);
  const body = pageItems.map((it) => {
    const recent = it.updatedAt
      ? `${escapeHtml(it.updatedAtDisplay || fmtProgTime(it.updatedAt))}<div class="pg-meta"><span class="pg-ip">${escapeHtml(it.updatedIp || '')}</span> ${escapeHtml(it.updatedBy || '')}</div>`
      : '—';
    const plan = `${escapeHtml(it.planDate || '—')} / ${escapeHtml(it.actualDate || '—')}`;
    return `<tr>
      <td>${escapeHtml(it.id)}</td>
      <td>${escapeHtml(it.batch)}</td>
      <td>${escapeHtml(it.module)}</td>
      <td title="${escapeHtml(it.desc)}">${escapeHtml(it.name)}</td>
      <td>${stageTag(it.stage)}</td>
      <td>${trackDots(it)}</td>
      <td>${plan}</td>
      <td>${recent}</td>
      <td class="ops"><button type="button" class="btn-text" data-prog-edit="${escapeHtml(it.id)}">更新</button></td>
    </tr>`;
  }).join('');
  const nums = [];
  const from = Math.max(1, progState.page - 2);
  const to = Math.min(pages, from + 4);
  for (let i = Math.max(1, to - 4); i <= to; i += 1) nums.push(i);
  const pager = nums.map((i) => `<button type="button" class="page-btn ${i === progState.page ? 'active' : ''}" data-prog-page="${i}">${i}</button>`).join('');
  el.innerHTML = `<table class="data">
    <thead><tr><th>编号</th><th>批次</th><th>模块</th><th>能力</th><th>阶段</th><th>六轨</th><th>计划 / 实际</th><th>最近修改</th><th>操作</th></tr></thead>
    <tbody>${body || '<tr><td colspan="9"><div class="empty">没有匹配的能力</div></td></tr>'}</tbody>
  </table>
  <div class="pagination"><span>共 ${items.length} 条</span>${pager}</div>`;
}

function progFilteredLogs(items) {
  if (!progFilterActive()) return progState.logs;
  const ids = new Set(items.map((it) => it.id));
  return progState.logs.filter((log) => ids.has(log.capId));
}

function progRenderLogs() {
  const el = document.getElementById('progLogs');
  if (!el) return;
  const logs = progFilteredLogs(progFiltered());
  if (!logs.length) {
    el.innerHTML = '<div class="empty">暂无变更。提交进度后，修改者、来源 IP 与修改时间会记在这里。</div>';
    return;
  }
  const rows = logs.slice(0, 80).map((log) => {
    const changes = (log.changes || []).map((c) => `${escapeHtml(c.field)}：${escapeHtml(c.before || '—')} → ${escapeHtml(c.after || '—')}`).join('<br>');
    return `<tr>
      <td>${escapeHtml(log.atDisplay || fmtProgTime(log.at))}</td>
      <td class="pg-ip">${escapeHtml(log.ip || '—')}</td>
      <td>${escapeHtml(log.operator || '—')}${log.operatorUser ? `<div class="pg-meta">${escapeHtml(log.operatorUser)}</div>` : ''}</td>
      <td>${escapeHtml(log.capId || '')}<div class="pg-meta">${escapeHtml(log.capName || '')}</div></td>
      <td>${escapeHtml(log.module || '')}</td>
      <td>${changes || '—'}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `<table class="data">
    <thead><tr><th>修改时间</th><th>来源 IP</th><th>修改者</th><th>能力</th><th>模块</th><th>变更内容</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="pagination"><span>共 ${logs.length} 条${logs.length > 80 ? '，显示最近 80 条' : ''}</span></div>`;
}

function progItemById(id) {
  return allProgItems().find((it) => it.id === id) || null;
}

function progFilterPick() {
  const q = progVal('progPickQ').trim().toLowerCase();
  const sel = document.getElementById('progPick');
  if (!sel) return;
  const current = sel.value;
  const list = allProgItems().filter((it) => {
    if (!q) return true;
    return [it.id, it.name, it.module, it.page].join(' ').toLowerCase().includes(q);
  });
  sel.innerHTML = list.map((it) => `<option value="${escapeHtml(it.id)}">${escapeHtml(it.id)} ${escapeHtml(it.module)} · ${escapeHtml(it.name)}</option>`).join('');
  if (list.some((it) => it.id === current)) sel.value = current;
  else if (list[0]) sel.value = list[0].id;
  progFillForm();
}

function progFillForm() {
  const it = progItemById(progVal('progPick'));
  const desc = document.getElementById('progPickDesc');
  if (!it) {
    if (desc) desc.textContent = '';
    return;
  }
  if (desc) desc.textContent = `${it.batch} · ${it.node} · ${it.page} · ${it.desc}`;
  PROG_EDIT_KEYS.forEach((k) => {
    const el = document.getElementById(`progF_${k}`);
    if (el) el.value = it[k] || '';
  });
}

function openProgModal(id) {
  const pickQ = document.getElementById('progPickQ');
  if (pickQ) pickQ.value = '';
  progFilterPick();
  const sel = document.getElementById('progPick');
  if (id && sel && [...sel.options].some((o) => o.value === id)) sel.value = id;
  progFillForm();
  const hint = document.getElementById('progIpHint');
  if (hint) {
    hint.textContent = progState.sync === 'ok'
      ? `提交后由服务端写入修改时间与来源 IP（当前 ${progState.clientIp || '—'}）。`
      : '进度服务未连接。提交会暂存本机，来源 IP 无法记录。';
  }
  openModal('modalProgress');
}

function progOperator() {
  const session = typeof readAuthSession === 'function' ? readAuthSession() : null;
  const name = document.getElementById('userName')?.textContent?.trim() || '演示用户';
  return { operator: name, operatorUser: session?.user || name };
}

function readProgForm(it) {
  const patch = {};
  PROG_EDIT_KEYS.forEach((k) => {
    patch[k] = document.getElementById(`progF_${k}`)?.value?.trim?.() ?? document.getElementById(`progF_${k}`)?.value ?? '';
    if (typeof patch[k] === 'string') patch[k] = patch[k].trim();
  });
  const before = {};
  PROG_EDIT_KEYS.forEach((k) => { before[k] = it[k] || ''; });
  return { patch, before };
}

function localProgChanges(before, patch) {
  const changes = [];
  PROG_EDIT_KEYS.forEach((k) => {
    const prev = before[k] || '';
    const next = patch[k] || '';
    if (prev !== next) changes.push({ field: PROG_FIELD_LABEL[k] || k, before: prev, after: next });
  });
  return changes;
}

async function saveProgProgress() {
  if (progState.saving) return;
  const id = progVal('progPick');
  const it = progItemById(id);
  if (!it) {
    toast('请选择能力', 'warn');
    return;
  }
  const { patch, before } = readProgForm(it);
  const badStatus = PROG_TRACKS.find((t) => !PROG_STATUSES.includes(patch[t.key]));
  if (badStatus) {
    toast('进度状态不在允许取值内', 'warn');
    return;
  }
  if (PROG_TRACKS.some((t) => patch[t.key] === '阻塞') && !patch.block) {
    toast('存在阻塞轨道时必须填写阻塞原因', 'warn');
    return;
  }
  const dateBad = ['planDate', 'actualDate'].find((k) => patch[k] && !/^\d{4}-\d{2}-\d{2}$/.test(patch[k]));
  if (dateBad) {
    toast('计划完成与实际完成须为日期', 'warn');
    return;
  }
  const changes = localProgChanges(before, patch);
  if (!changes.length) {
    toast('没有变更', 'warn');
    return;
  }
  const who = progOperator();
  const payload = {
    id,
    patch,
    before,
    operator: who.operator,
    operatorUser: who.operatorUser,
    capName: it.name,
    module: it.module,
  };
  progState.saving = true;
  try {
    const res = await fetch(`${progApiBase()}/api/dev-progress`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let body = {};
    try { body = await res.json(); } catch { /* 非 JSON */ }
    if (res.status === 400) {
      toast(body.message || '提交未通过校验', 'warn');
      return;
    }
    if (!res.ok || !body.success) throw new Error(body.message || '保存失败');
    const data = body.data || {};
    if (data.item) progState.overrides[id] = data.item;
    if (Array.isArray(data.logs)) progState.logs = data.logs;
    progState.clientIp = data.clientIp || progState.clientIp;
    progState.revision = Number(data.revision) || progState.revision;
    progState.sync = 'ok';
    persistProgLocal();
    closeModal('modalProgress');
    progRender();
    toast(`已提交 ${id} 的进度`, 'ok');
  } catch {
    const now = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const display = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
    progState.overrides[id] = {
      ...patch,
      updatedAt: now.toISOString(),
      updatedAtDisplay: display,
      updatedBy: who.operator,
      updatedIp: '未能获取',
    };
    progState.logs = [{
      id: `plog-local-${Date.now()}`,
      at: now.toISOString(),
      atDisplay: display,
      ip: '未能获取',
      operator: who.operator,
      operatorUser: who.operatorUser,
      capId: id,
      capName: it.name,
      module: it.module,
      changes,
    }, ...progState.logs].slice(0, 500);
    progState.sync = 'local';
    persistProgLocal();
    closeModal('modalProgress');
    progRender();
    toast('进度服务未连通，已暂存本机，来源 IP 未能记录', 'warn');
  } finally {
    progState.saving = false;
  }
}
